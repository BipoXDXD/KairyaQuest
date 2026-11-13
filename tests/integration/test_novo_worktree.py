"""Testes do `scripts/novo-worktree.sh` (pendencia 19).

O script cria um worktree interno ao principal, com banco de teste e portas do
E2E proprios, para dois gates rodarem ao mesmo tempo. Os testes o executam DE
VERDADE, mas num repositorio git temporario: uma copia do script (e da
biblioteca `push-env.sh`, de onde ele tira a reserva de portas do push) fica
em `<tmp>/FocusQuest/scripts/`, e o script resolve o principal a partir do
proprio caminho -- nunca encosta no repositorio real.

O principal tem um remoto `origin` (um repositorio bare temporario): o worktree
novo nasce da `origin/main`, nao da `main` local (pendencia P-worktree-base-1).
Quem muda o que o script enxerga como "a main" empurra para o remoto
(`Repositorio.publicar`); num commit so local o script nao toca.

O `make` do PATH e falso: registra os argumentos num arquivo e sai com zero.
Assim "roda `make bootstrap`" e verificavel sem `npm ci` nenhum, e "nao roda"
tambem -- uma recusa que chamasse o `make` deixaria rastro.

Nenhum teste conecta em banco: o script so ESCREVE o nome do banco no `.env`;
quem o cria e o gate, no primeiro uso (`test_banco_de_teste.py`).
"""

import fcntl
import os
import re
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
from collections.abc import Iterator
from contextlib import ExitStack, closing, contextmanager
from pathlib import Path
from typing import IO

import pytest

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / "scripts" / "novo-worktree.sh"
BIBLIOTECA = RAIZ / "scripts" / "push-env.sh"
EXEMPLO = RAIZ / ".env.example"
SERVERS_TS = RAIZ / "frontend" / "tests" / "e2e" / "servers.ts"

# As quatro portas-base do E2E, na ordem do script: API, frontend, falso, galeria.
NOMES_DAS_PORTAS = ("API", "frontend", "falso", "galeria")
# O teto dos worktrees por convencao (FQ_RESERVA_DO_PUSH - 1): de 25 em diante
# e do pre-push.
TETO_DOS_WORKTREES = 24
PORTA_MAXIMA = 65535

PREFIXO = "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:55432/"
ENV_PRINCIPAL = (
    "# comentario que atravessa\n"
    f"FOCUSQUEST_DATABASE_URL={PREFIXO}focusquest_do_principal\n"
    f"FOCUSQUEST_TEST_DATABASE_URL={PREFIXO}focusquest_test?options=-c%20x\n"
    "FOCUSQUEST_TUTOR_MODEL=claude-opus-5\n"
)


def _porta_esta_livre(porta: int) -> bool:
    with closing(socket.socket()) as teste:
        try:
            teste.bind(("127.0.0.1", porta))
        except OSError:
            return False
    return True


def _janela_esta_livre(bases: tuple[int, int, int, int]) -> bool:
    return all(
        _porta_esta_livre(base + deslocamento)
        for base in bases
        for deslocamento in range(TETO_DOS_WORKTREES + 1)
    )


def _reservar_janela_de_portas() -> tuple[tuple[int, int, int, int], IO[str]]:
    """Quatro portas-base cujas janelas de 0 a 24 estao livres, ja reservadas.

    O script sonda as portas de verdade; com as bases reais (8100, 5273...) o
    resultado dependeria do que a maquina roda. Os testes apontam o script
    (`FQ_PORTAS_BASE_E2E`) para uma janela propria, abaixo da faixa das portas
    efemeras, e checam por bind que nada a ocupa. Nenhum teste encosta nas
    portas reais do projeto.

    Por que a trava (issue #167): "livre agora" nao basta. Gates de worktrees
    diferentes rodam ao mesmo tempo, e um teste do outro processo pode ocupar a
    MESMA janela depois da sondagem. Um `flock` por janela, no temporario do
    sistema, da a cada janela um dono so entre processos; quem chega depois
    pula para a proxima. A trava devolvida vale ate ser fechada no teardown.
    """
    inicios = range(20000, 30000, 211)
    prefixo = Path(tempfile.gettempdir()) / "kairyaquest-portas-"
    for inicio in inicios:
        caminho = Path(f"{prefixo}{inicio}.lock")
        trava = caminho.open("a")
        try:
            fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            trava.close()
            continue
        bases = (inicio, inicio + 40, inicio + 80, inicio + 120)
        if _janela_esta_livre(bases):
            return bases, trava
        trava.close()
    raise AssertionError(
        f"nenhuma janela de portas livre para os testes: as {len(inicios)} janelas"
        f" estao travadas por outro processo ({prefixo}<inicio>.lock) ou tem"
        " porta ocupada; espere os outros gates terminarem"
    )


class Repositorio:
    """O principal temporario, o `make` falso e o jeito de rodar o script."""

    def __init__(self, tmp_path: Path) -> None:
        self.bases, self._trava_das_portas = _reservar_janela_de_portas()
        # Uma construcao que quebra no meio nao chega ao teardown da fixture:
        # sem isto, a janela ficaria travada ate o processo acabar (issue #196).
        try:
            self._montar(tmp_path)
        except BaseException:
            self._trava_das_portas.close()
            raise

    def _montar(self, tmp_path: Path) -> None:
        self.base = tmp_path
        self.principal = tmp_path / "FocusQuest"
        self.registro_do_make = tmp_path / "make-chamado"
        bin_falso = tmp_path / "bin"
        bin_falso.mkdir()
        self._make_falso = bin_falso / "make"
        self._make_falso.write_text(
            f'#!/bin/sh\necho "$@" >> "{self.registro_do_make}"\n'
        )
        self._make_falso.chmod(0o755)
        self.ambiente = {
            chave: valor
            for chave, valor in os.environ.items()
            if not chave.startswith(("FOCUSQUEST_", "GIT_"))
        } | {
            "PATH": f"{bin_falso}{os.pathsep}{os.environ['PATH']}",
            "FQ_PORTAS_BASE_E2E": " ".join(map(str, self.bases)),
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "teste",
            "GIT_AUTHOR_EMAIL": "teste@example.invalid",
            "GIT_COMMITTER_NAME": "teste",
            "GIT_COMMITTER_EMAIL": "teste@example.invalid",
        }

        self.principal.mkdir()
        self.git("init", "-q", "-b", "main")
        (self.principal / ".gitignore").write_text(".env\n.claude/\n.superpowers/\n")
        (self.principal / "README.md").write_text("principal\n")
        shutil.copy2(EXEMPLO, self.principal / ".env.example")
        # O script e a biblioteca entram VERSIONADOS: o script so roda se a
        # copia dele for a da origin/main (issue #194).
        scripts = self.principal / "scripts"
        scripts.mkdir()
        shutil.copy2(SCRIPT, scripts / "novo-worktree.sh")
        shutil.copy2(BIBLIOTECA, scripts / "push-env.sh")
        self.git("add", ".")
        self.git("commit", "-q", "-m", "base")
        # O remoto: um bare ao lado do principal, ja com a main empurrada.
        self.remoto = tmp_path / "remoto.git"
        self.git("init", "-q", "--bare", "-b", "main", str(self.remoto))
        self.git("remote", "add", "origin", str(self.remoto))
        self.publicar()
        (self.principal / ".env").write_text(ENV_PRINCIPAL)

    def git(self, *argumentos: str, onde: Path | None = None) -> str:
        return subprocess.run(
            ["git", *argumentos],
            cwd=onde or self.principal,
            env=self.ambiente,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

    def publicar(self) -> None:
        """Empurra a main local para o remoto: o que o script passa a enxergar."""
        self.git("push", "-q", "origin", "main")

    def rodar(
        self, *argumentos: str, timeout: float | None = None
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(self.principal / "scripts" / "novo-worktree.sh"), *argumentos],
            cwd=self.base,
            env=self.ambiente,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )

    def falhar_o_bootstrap(self, antes_de_falhar: str = "") -> None:
        """O `make` falso passa a registrar a chamada, rodar `antes_de_falhar`
        (shell, no diretorio do `-C`) e sair com 2, como um bootstrap que
        quebra no meio."""
        self._make_falso.write_text(
            "#!/bin/sh\n"
            f'echo "$@" >> "{self.registro_do_make}"\n'
            f'cd "$2" && {antes_de_falhar or ":"}\n'
            "exit 2\n"
        )

    def consertar_o_bootstrap(self) -> None:
        self._make_falso.write_text(
            f'#!/bin/sh\necho "$@" >> "{self.registro_do_make}"\n'
        )

    def liberar_portas(self) -> None:
        self._trava_das_portas.close()

    def make_chamado(self) -> list[str]:
        if not self.registro_do_make.exists():
            return []
        return self.registro_do_make.read_text().splitlines()

    def worktrees(self) -> list[str]:
        return [
            linha.removeprefix("worktree ")
            for linha in self.git("worktree", "list", "--porcelain").splitlines()
            if linha.startswith("worktree ")
        ]


@pytest.fixture
def repo(tmp_path: Path) -> Iterator[Repositorio]:
    repositorio = Repositorio(tmp_path)
    yield repositorio
    repositorio.liberar_portas()


def _valor(env: str, chave: str) -> str:
    linhas = [linha for linha in env.splitlines() if linha.startswith(f"{chave}=")]
    assert len(linhas) == 1, linhas
    return linhas[0].split("=", 1)[1]


def test_cria_o_worktree_com_banco_e_portas_proprios(repo: Repositorio) -> None:
    resultado = repo.rodar("medida")

    assert resultado.returncode == 0, resultado.stderr
    destino = repo.principal / ".claude" / "worktrees" / "medida"
    # Branch nova, a partir da main.
    assert repo.git("rev-parse", "--abbrev-ref", "HEAD", onde=destino) == "wt/medida"
    assert repo.git("rev-parse", "HEAD", onde=destino) == repo.git(
        "rev-parse", "origin/main"
    )

    env = (destino / ".env").read_text()
    # So o NOME do banco de teste muda; servidor, credencial e query ficam.
    assert _valor(env, "FOCUSQUEST_TEST_DATABASE_URL") == (
        f"{PREFIXO}focusquest_medida_test"
    )
    # O resto vem do .env.example, nao do .env do principal.
    assert _valor(env, "FOCUSQUEST_DATABASE_URL") == f"{PREFIXO}focusquest"
    assert "claude-opus-5" not in env
    assert "# comentario que atravessa" not in env
    # O principal nao declara deslocamento (0); o primeiro livre e 1.
    assert _valor(env, "FOCUSQUEST_E2E_PORT_OFFSET") == "1"

    assert repo.make_chamado() == [f"-C {destino} bootstrap"]
    assert "focusquest_medida_test" in resultado.stdout
    # As portas impressas saem das mesmas bases que o script sondou.
    assert str(repo.bases[0] + 1) in resultado.stdout
    assert "make check" in resultado.stdout
    # O .env do principal nao muda.
    assert (repo.principal / ".env").read_text() == ENV_PRINCIPAL


def test_nao_instala_hooks_e_aponta_para_o_script_unico(repo: Repositorio) -> None:
    """Lote 20: `pre-commit install` por worktree fixava o `.venv` dele nos hooks
    do `.git` comum. O script nao instala hook nenhum; so manda usar o unico
    instalador, uma vez por clone."""
    hooks = repo.principal / ".git" / "hooks"
    antes = sorted(p.name for p in hooks.iterdir())

    resultado = repo.rodar("medida")

    assert resultado.returncode == 0, resultado.stderr
    assert sorted(p.name for p in hooks.iterdir()) == antes
    assert "scripts/instalar-hooks.sh" in resultado.stdout
    assert 'nao rode "pre-commit install"' in resultado.stdout


def _chaves_em_branco_do_exemplo() -> list[str]:
    """As chaves que o `.env.example` deixa vazias: as de segredo."""
    return [
        linha.split("=", 1)[0]
        for linha in EXEMPLO.read_text().splitlines()
        if not linha.startswith("#") and linha.endswith("=")
    ]


def test_o_env_do_worktree_nao_herda_segredo_do_principal(
    repo: Repositorio,
) -> None:
    """O `.env` do principal guarda chaves reais; o do worktree nao pode
    carrega-las. Cada chave em branco no `.env.example`, e uma que o exemplo
    nem conhece, recebe um canario no principal: nenhum aparece no worktree."""
    chaves = _chaves_em_branco_do_exemplo()
    assert "FOCUSQUEST_ANTHROPIC_API_KEY" in chaves
    canarios = {
        chave: f"CANARY-{uuid.uuid4()}"
        for chave in [*chaves, "FOCUSQUEST_SEGREDO_FORA_DO_EXEMPLO"]
    }
    (repo.principal / ".env").write_text(
        ENV_PRINCIPAL
        + "".join(f"{chave}={canario}\n" for chave, canario in canarios.items())
    )

    resultado = repo.rodar("sem-segredo")

    assert resultado.returncode == 0, resultado.stderr
    env = (repo.principal / ".claude/worktrees/sem-segredo/.env").read_text()
    assert [c for c in canarios.values() if c in env] == []
    assert "CANARY-" not in resultado.stdout + resultado.stderr
    for chave in chaves:
        assert _valor(env, chave) == ""


def test_o_env_do_worktree_nasce_so_do_exemplo_e_passa_no_settings(
    repo: Repositorio, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Nada do `.env` do principal vai para o do worktree: nem a chave que o
    exemplo nao conhece (`FOCUSQUEST_CHAVE_REMOVIDA` ja foi uma), nem uma variavel
    qualquer, nem o servidor, a credencial e a query da URL do banco dele. O
    resultado e carregado pelo `Settings` (`extra="forbid"`)."""
    from focusquest.core.config import Settings

    canario_removida = f"CANARY-{uuid.uuid4()}"
    canario_outra = f"CANARY-{uuid.uuid4()}"
    canario_banco = f"CANARY-{uuid.uuid4()}"
    (repo.principal / ".env").write_text(
        f"FOCUSQUEST_CHAVE_REMOVIDA={canario_removida}\n"
        f"FOCUSQUEST_OUTRA_VARIAVEL={canario_outra}\n"
        "FOCUSQUEST_TEST_DATABASE_URL=postgresql+psycopg://"
        f"{canario_banco}:{canario_banco}@{canario_banco}.invalid:5999/"
        f"focusquest_test?options={canario_banco}\n"
    )

    resultado = repo.rodar("so-exemplo")

    assert resultado.returncode == 0, resultado.stderr
    env = (repo.principal / ".claude/worktrees/so-exemplo/.env").read_text()
    for canario in (canario_removida, canario_outra, canario_banco):
        assert canario not in env
        assert canario not in resultado.stdout + resultado.stderr
    assert "FOCUSQUEST_CHAVE_REMOVIDA" not in env
    assert "FOCUSQUEST_OUTRA_VARIAVEL" not in env
    assert _valor(env, "FOCUSQUEST_TEST_DATABASE_URL") == (
        f"{PREFIXO}focusquest_so-exemplo_test"
    )
    for chave in [c for c in os.environ if c.startswith("FOCUSQUEST_")]:
        monkeypatch.delenv(chave)
    settings = Settings(_env_file=repo.principal / ".claude/worktrees/so-exemplo/.env")
    assert settings.test_database_url.endswith("/focusquest_so-exemplo_test")


def test_recusa_se_a_main_nao_tem_env_example(repo: Repositorio) -> None:
    repo.git("rm", "-q", ".env.example")
    repo.git("commit", "-q", "-m", "sem exemplo")
    repo.publicar()
    antes = repo.worktrees()

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert ".env.example" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_recusa_se_o_exemplo_nao_tem_banco_de_teste(repo: Repositorio) -> None:
    """Servidor e credencial do banco vem do exemplo; sem a linha nao ha de
    onde derivar a URL, e o worktree cairia no banco padrao -- o do principal."""
    (repo.principal / ".env.example").write_text("FOCUSQUEST_ANTHROPIC_API_KEY=\n")
    repo.git("commit", "-q", "-am", "exemplo curto")
    repo.publicar()
    antes = repo.worktrees()

    resultado = repo.rodar("curto")

    assert resultado.returncode != 0
    assert "FOCUSQUEST_TEST_DATABASE_URL" in resultado.stderr
    assert ".env.example" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_a_query_da_url_do_exemplo_e_preservada(repo: Repositorio) -> None:
    exemplo = repo.principal / ".env.example"
    atual = _valor(exemplo.read_text(), "FOCUSQUEST_TEST_DATABASE_URL")
    exemplo.write_text(exemplo.read_text().replace(atual, f"{atual}?options=-c%20x"))
    repo.git("commit", "-q", "-am", "exemplo com query")
    repo.publicar()
    # O principal tem outra query: a do worktree so pode vir do exemplo.
    (repo.principal / ".env").write_text(
        ENV_PRINCIPAL.replace("?options=-c%20x", "?options=-c%20y")
    )

    resultado = repo.rodar("com-query")

    assert resultado.returncode == 0, resultado.stderr
    env = (repo.principal / ".claude/worktrees/com-query/.env").read_text()
    assert _valor(env, "FOCUSQUEST_TEST_DATABASE_URL") == (
        f"{PREFIXO}focusquest_com-query_test?options=-c%20x"
    )


def test_o_deslocamento_automatico_e_o_menor_livre(repo: Repositorio) -> None:
    """Os deslocamentos em uso sao lidos do `.env` de cada worktree existente;
    o principal sem a linha conta como 0."""
    assert repo.rodar("um").returncode == 0
    assert repo.rodar("dois", "3").returncode == 0

    resultado = repo.rodar("tres")

    assert resultado.returncode == 0, resultado.stderr
    env = (repo.principal / ".claude" / "worktrees" / "tres" / ".env").read_text()
    assert _valor(env, "FOCUSQUEST_E2E_PORT_OFFSET") == "2"


def test_um_deslocamento_do_principal_substitui_a_linha(repo: Repositorio) -> None:
    """Se o `.env` do principal ja tiver a linha, o novo nao a herda: fica uma
    so, com o valor do worktree novo."""
    (repo.principal / ".env").write_text(
        ENV_PRINCIPAL + "FOCUSQUEST_E2E_PORT_OFFSET=5\n"
    )

    resultado = repo.rodar("outro", "7")

    assert resultado.returncode == 0, resultado.stderr
    env = (repo.principal / ".claude" / "worktrees" / "outro" / ".env").read_text()
    assert _valor(env, "FOCUSQUEST_E2E_PORT_OFFSET") == "7"


def _nada_foi_criado(repo: Repositorio, antes: list[str]) -> None:
    assert repo.worktrees() == antes
    assert repo.make_chamado() == []
    assert repo.git("branch", "--list", "wt/*") == ""


@pytest.mark.parametrize(
    "nome",
    [
        "",
        "Maiuscula",
        "com_sublinhado",
        "-comeca-com-hifen",
        "a/b",
        "a b",
        "../fora",
        "x" * 31,
    ],
)
def test_recusa_nome_invalido(repo: Repositorio, nome: str) -> None:
    """So `[a-z0-9-]`, comecando por letra ou digito, ate 30 caracteres: o nome
    vira diretorio, branch e nome de banco -- e o banco do push
    (`focusquest_<nome>_push_test`) precisa caber nos 63 bytes do PostgreSQL."""
    antes = repo.worktrees()

    resultado = repo.rodar(nome)

    assert resultado.returncode != 0
    assert "nome invalido" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_recusa_worktree_que_ja_existe(repo: Repositorio) -> None:
    ocupado = repo.principal / ".claude" / "worktrees" / "ja"
    ocupado.mkdir(parents=True)
    (ocupado / "arquivo").write_text("intocado\n")
    antes = repo.worktrees()

    resultado = repo.rodar("ja")

    assert resultado.returncode != 0
    assert "ja existe" in resultado.stderr
    assert sorted(p.name for p in ocupado.iterdir()) == ["arquivo"]
    assert (ocupado / "arquivo").read_text() == "intocado\n"
    _nada_foi_criado(repo, antes)


def test_recusa_branch_que_ja_existe(repo: Repositorio) -> None:
    repo.git("branch", "wt/ja")
    antes = repo.worktrees()

    resultado = repo.rodar("ja")

    assert resultado.returncode != 0
    assert "wt/ja" in resultado.stderr
    assert repo.worktrees() == antes
    assert repo.make_chamado() == []


@pytest.mark.parametrize("deslocamento", ["25", "49", "abc", "-1", "0"])
def test_recusa_deslocamento_fora_da_faixa_ou_em_uso(
    repo: Repositorio, deslocamento: str
) -> None:
    """De 25 em diante e do pre-push; 0 e o do principal, em uso."""
    antes = repo.worktrees()

    resultado = repo.rodar("novo", deslocamento)

    assert resultado.returncode != 0
    assert "deslocamento" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_funciona_sem_env_no_principal(repo: Repositorio) -> None:
    """O `.env` do worktree nasce so do `.env.example` da origin/main: o do
    principal nao e lido para montar nada, entao a falta dele nao recusa."""
    (repo.principal / ".env").unlink()

    resultado = repo.rodar("novo")

    assert resultado.returncode == 0, resultado.stderr
    env = (repo.principal / ".claude/worktrees/novo/.env").read_text()
    assert _valor(env, "FOCUSQUEST_TEST_DATABASE_URL") == (
        f"{PREFIXO}focusquest_novo_test"
    )


def test_recusa_se_o_banco_de_teste_do_exemplo_nao_termina_em_test(
    repo: Repositorio,
) -> None:
    exemplo = repo.principal / ".env.example"
    atual = _valor(exemplo.read_text(), "FOCUSQUEST_TEST_DATABASE_URL")
    exemplo.write_text(exemplo.read_text().replace(atual, atual.removesuffix("_test")))
    repo.git("commit", "-q", "-am", "exemplo com banco sem _test")
    repo.publicar()
    antes = repo.worktrees()

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "_test" in resultado.stderr
    assert ".env.example" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_nunca_sobrescreve_um_env_existente(repo: Repositorio) -> None:
    """O `.env` e ignorado pelo git, mas um repositorio que o versionasse (ou
    um `git worktree add` que o trouxesse de outro jeito) deixaria um no
    destino: o script recusa em vez de escrever por cima, e nao segue para o
    bootstrap."""
    (repo.principal / ".gitignore").write_text("")
    (repo.principal / ".env").write_text("VERSIONADO=1\n")
    repo.git("add", ".env", ".gitignore")
    repo.git("commit", "-q", "-m", "env versionado")
    repo.publicar()
    (repo.principal / ".env").write_text(ENV_PRINCIPAL)

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "ja existe um .env" in resultado.stderr
    assert "nao foi possivel escrever" not in resultado.stderr
    assert (
        repo.principal / ".claude" / "worktrees" / "novo" / ".env"
    ).read_text() == "VERSIONADO=1\n"
    assert repo.make_chamado() == []


def test_falha_ao_escrever_o_env_nao_se_passa_por_env_existente(
    repo: Repositorio,
) -> None:
    """A escrita do `.env` pode falhar por outra causa que nao um `.env` ja
    presente (disco cheio, permissao, diretorio sumido). A mensagem distingue:
    nao diz "ja existe", diz que nao conseguiu escrever e repassa o erro do
    shell. Para provocar a falha sem depender de permissao (que o root
    ignoraria), um hook `post-checkout` do repositorio temporario apaga o
    worktree logo depois de o `git worktree add` cria-lo: o caminho do `.env`
    deixa de existir (ENOENT)."""
    gancho = repo.principal / ".git" / "hooks" / "post-checkout"
    gancho.write_text('#!/bin/sh\nrm -rf "$PWD"\n')
    gancho.chmod(0o755)

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "nao foi possivel escrever" in resultado.stderr
    assert "ja existe" not in resultado.stderr
    assert (
        str(repo.principal / ".claude" / "worktrees" / "novo" / ".env")
        in resultado.stderr
    )
    assert repo.make_chamado() == []


def test_sem_argumento_mostra_o_uso(repo: Repositorio) -> None:
    resultado = repo.rodar()
    assert resultado.returncode == 64
    assert "uso: scripts/novo-worktree.sh <nome> [deslocamento]" in resultado.stderr


# --- Colisao com o banco do push -------------------------------------------
#
# O banco de um worktree criado pelo script e `focusquest_<nome>_test`; o push
# de quem tem o banco `R_test` usa `R_push_test` (F9). `focusquest_<x>_test`
# so e igual a um `R_push_test` se `focusquest_<x>` terminar em `_push`; como
# `<x>` nao tem `_`, o unico `_` de `focusquest_<x>` e o do prefixo, e isso so
# acontece com `<x> == "push"` (R = `focusquest`, o do principal padrao). Por
# isso `push` e reservado. No sentido contrario (o PUSH do worktree novo,
# `focusquest_<x>_push_test`, igual ao banco de alguem), nenhum banco criado
# pelo script casa, pela mesma razao -- mas um `.env` editado a mao pode, e o
# script confere os bancos (e os bancos de push) de todo worktree registrado.


def _trocar_banco(destino: Path, banco: str) -> None:
    env = (destino / ".env").read_text()
    atual = _valor(env, "FOCUSQUEST_TEST_DATABASE_URL")
    (destino / ".env").write_text(
        env.replace(atual, f"{PREFIXO}{banco}?options=-c%20x")
    )


def test_recusa_o_nome_push_que_seria_o_banco_do_push_do_principal(
    repo: Repositorio,
) -> None:
    """`focusquest_push_test` e o banco do gate do push do principal: um
    worktree com esse banco levaria `DROP SCHEMA` no meio da suite a cada push
    feito do principal."""
    antes = repo.worktrees()

    resultado = repo.rodar("push")

    assert resultado.returncode != 0
    assert "focusquest_push_test" in resultado.stderr
    assert "reservado" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_push_e_reservado_mesmo_se_o_principal_usar_outro_banco(
    repo: Repositorio,
) -> None:
    """A reserva e estrutural, nao depende do `.env` de hoje: o principal pode
    voltar ao banco padrao depois que o worktree existir."""
    (repo.principal / ".env").write_text(
        ENV_PRINCIPAL.replace("focusquest_test?", "outro_test?")
    )
    antes = repo.worktrees()

    resultado = repo.rodar("push")

    assert resultado.returncode != 0
    assert "reservado" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_recusa_nome_cujo_push_cairia_no_banco_de_outro_worktree(
    repo: Repositorio,
) -> None:
    """Um worktree com `.env` editado a mao para `focusquest_b_push_test`: o
    push de um worktree `b` usaria esse banco."""
    assert repo.rodar("a").returncode == 0
    _trocar_banco(
        repo.principal / ".claude" / "worktrees" / "a", "focusquest_b_push_test"
    )
    antes = repo.worktrees()
    make_antes = repo.make_chamado()

    resultado = repo.rodar("b")

    assert resultado.returncode != 0
    assert "focusquest_b_push_test" in resultado.stderr
    assert str(repo.principal / ".claude" / "worktrees" / "a") in resultado.stderr
    assert repo.worktrees() == antes
    assert repo.make_chamado() == make_antes
    assert repo.git("branch", "--list", "wt/b") == ""


def test_recusa_nome_cujo_banco_ja_e_de_outro_worktree(repo: Repositorio) -> None:
    assert repo.rodar("a").returncode == 0
    _trocar_banco(repo.principal / ".claude" / "worktrees" / "a", "focusquest_c_test")
    antes = repo.worktrees()

    resultado = repo.rodar("c")

    assert resultado.returncode != 0
    assert "focusquest_c_test" in resultado.stderr
    assert repo.worktrees() == antes
    assert repo.git("branch", "--list", "wt/c") == ""


def test_nomes_vizinhos_de_push_nao_colidem(repo: Repositorio) -> None:
    """`a-push`, `push-a` e `pushx` sao aceitos: o hifen nao vira sublinhado,
    entao `focusquest_a-push_test` nao e o `focusquest_a_push_test` do push de
    `a`. Todos os bancos de teste e de push, principal incluido, sao
    distintos."""
    nomes = ["a", "a-push", "push-a", "pushx"]
    for nome in nomes:
        resultado = repo.rodar(nome)
        assert resultado.returncode == 0, resultado.stderr

    bancos = ["focusquest"] + [f"focusquest_{nome}" for nome in nomes]
    todos = [f"{raiz}_test" for raiz in bancos] + [
        f"{raiz}_push_test" for raiz in bancos
    ]
    assert len(set(todos)) == len(todos)
    for nome in nomes:
        env = (repo.principal / ".claude" / "worktrees" / nome / ".env").read_text()
        assert _valor(env, "FOCUSQUEST_TEST_DATABASE_URL") == (
            f"{PREFIXO}focusquest_{nome}_test"
        )


# --- Trava contra duas execucoes simultaneas --------------------------------


def _trava(repo: Repositorio) -> Path:
    return repo.principal / ".git" / "novo-worktree.lock"


def test_recusa_enquanto_outra_execucao_segura_a_trava(repo: Repositorio) -> None:
    """Duas execucoes ao mesmo tempo leriam os mesmos deslocamentos livres e
    escolheriam o mesmo. A trava (um diretorio criado com `mkdir`, atomico)
    faz a segunda recusar -- sem apagar a trava da primeira."""
    _trava(repo).mkdir()
    antes = repo.worktrees()

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "outra execucao" in resultado.stderr
    assert str(_trava(repo)) in resultado.stderr
    assert _trava(repo).is_dir()
    _nada_foi_criado(repo, antes)


def test_a_trava_e_liberada_no_sucesso_e_na_recusa(repo: Repositorio) -> None:
    assert repo.rodar("um").returncode == 0
    assert not _trava(repo).exists()

    recusado = repo.rodar("dois", "1")  # o 1 ja e do "um"

    assert recusado.returncode != 0
    assert "em uso" in recusado.stderr
    assert not _trava(repo).exists()
    assert repo.rodar("dois").returncode == 0


def test_worktree_interno_preserva_outros_projetos_e_centraliza_ledger(
    repo: Repositorio,
) -> None:
    vizinho = repo.base / "OutroProjeto"
    vizinho.mkdir()
    arquivo = vizinho / "original.txt"
    arquivo.write_text("preservado\n")
    antes = set(repo.base.iterdir())

    resultado = repo.rodar("interno")

    assert resultado.returncode == 0, resultado.stderr
    destino = repo.principal / ".claude/worktrees/interno"
    central = repo.principal / ".superpowers/sdd/worktree-ledgers/interno"
    link = destino / ".superpowers/sdd"
    assert link.is_symlink()
    assert link.resolve() == central.resolve()
    (link / "prova.txt").write_text("evidencia\n")
    assert (central / "prova.txt").read_text() == "evidencia\n"
    assert set(repo.base.iterdir()) - antes == {repo.registro_do_make}
    assert arquivo.read_text() == "preservado\n"
    assert not (destino / ".superpowers").is_symlink()


@pytest.mark.parametrize("quebrado", [False, True])
def test_recusa_ledger_preexistente_sem_criar_worktree(
    repo: Repositorio,
    quebrado: bool,
) -> None:
    central = repo.principal / ".superpowers/sdd/worktree-ledgers/novo"
    central.parent.mkdir(parents=True)
    if quebrado:
        central.symlink_to(repo.base / "ausente", target_is_directory=True)
    else:
        central.mkdir()
        (central / "prova.txt").write_text("intocado\n")
    antes = repo.worktrees()

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "ledger" in resultado.stderr
    _nada_foi_criado(repo, antes)
    assert not (repo.principal / ".claude").exists()
    if quebrado:
        assert central.is_symlink()
    else:
        assert (central / "prova.txt").read_text() == "intocado\n"


@pytest.mark.parametrize(
    "componente",
    [
        ".claude",
        ".claude/worktrees",
        ".superpowers",
        ".superpowers/sdd",
        ".superpowers/sdd/worktree-ledgers",
    ],
)
@pytest.mark.parametrize("tipo", ["arquivo", "link", "link-quebrado"])
def test_recusa_container_inseguro_sem_criar_branch(
    repo: Repositorio,
    componente: str,
    tipo: str,
) -> None:
    caminho = repo.principal / componente
    caminho.parent.mkdir(parents=True, exist_ok=True)
    externo = repo.base / "externo"
    if tipo == "arquivo":
        caminho.write_text("preservado\n")
    else:
        if tipo == "link":
            externo.mkdir()
        caminho.symlink_to(externo, target_is_directory=True)
    antes = repo.worktrees()
    resultado = repo.rodar("novo")
    assert resultado.returncode != 0
    _nada_foi_criado(repo, antes)
    assert not externo.exists() or list(externo.iterdir()) == []


def test_recusa_destino_link_quebrado(repo: Repositorio) -> None:
    destino = repo.principal / ".claude/worktrees/novo"
    destino.parent.mkdir(parents=True)
    destino.symlink_to(repo.base / "ausente", target_is_directory=True)
    antes = repo.worktrees()
    resultado = repo.rodar("novo")
    assert resultado.returncode != 0
    assert "destino" in resultado.stderr
    _nada_foi_criado(repo, antes)
    assert destino.is_symlink()


def test_chamada_por_outro_worktree_usa_principal(repo: Repositorio) -> None:
    assert repo.rodar("primeiro").returncode == 0
    primeiro = repo.principal / ".claude/worktrees/primeiro"
    env = primeiro / ".env"
    env.write_text(env.read_text().replace("127.0.0.1", "filho.invalid"))
    resultado = subprocess.run(
        [str(primeiro / "scripts/novo-worktree.sh"), "segundo"],
        cwd=primeiro,
        env=repo.ambiente,
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode == 0, resultado.stderr
    segundo = repo.principal / ".claude/worktrees/segundo"
    assert segundo.as_posix() in repo.worktrees()
    # O servidor do banco de teste e o do principal, nao o de quem chamou.
    assert _valor((segundo / ".env").read_text(), "FOCUSQUEST_TEST_DATABASE_URL") == (
        f"{PREFIXO}focusquest_segundo_test"
    )
    assert _valor((segundo / ".env").read_text(), "FOCUSQUEST_E2E_PORT_OFFSET") == "2"
    assert (
        segundo / ".superpowers/sdd"
    ).resolve() == repo.principal / ".superpowers/sdd/worktree-ledgers/segundo"


@pytest.mark.parametrize("tipo", ["diretorio", "link-container", "link-sdd"])
def test_recusa_scratch_trazido_pelo_checkout(repo: Repositorio, tipo: str) -> None:
    externo = repo.base / "externo"
    externo.mkdir()
    marcador = externo / "intocado"
    marcador.write_text("preservado\n")
    gancho = repo.principal / ".git/hooks/post-checkout"
    if tipo == "diretorio":
        operacao = (
            "mkdir -p .superpowers/sdd; echo preservado > .superpowers/sdd/intocado"
        )
    elif tipo == "link-container":
        operacao = f'ln -s "{externo}" .superpowers'
    else:
        operacao = f'mkdir .superpowers; ln -s "{externo}" .superpowers/sdd'
    gancho.write_text(f"#!/bin/sh\n{operacao}\n")
    gancho.chmod(0o755)

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "scratch" in resultado.stderr
    assert repo.make_chamado() == []
    assert list(externo.iterdir()) == [marcador]
    assert marcador.read_text() == "preservado\n"
    assert not (repo.principal / ".superpowers/sdd/worktree-ledgers/novo").exists()
    if tipo == "diretorio":
        assert (
            repo.principal / ".claude/worktrees/novo/.superpowers/sdd/intocado"
        ).read_text() == "preservado\n"


# ---------------------------------------------------------------------------
# A base do worktree e a origin/main, depois de um fetch do proprio script
# (pendencia P-worktree-base-1)
# ---------------------------------------------------------------------------
#
# Num repositorio bare (o principal deste projeto) "git fetch" atualiza so a
# `origin/main`: a `main` local fica parada no ultimo commit feito ali. Um
# worktree criado da `main` local nascia de uma revisao velha e com um
# `.env.example` velho -- o `.env` gerado era recusado pelas Settings.

MARCADOR_DO_REMOTO = "FOCUSQUEST_CHAVE_SO_DO_REMOTO"
# O inicio da mensagem de recusa do fetch (a do script, nao a do git, que sai
# traduzida conforme o locale).
RECUSA_DO_FETCH = "!! o fetch de origin/main falhou"


def _avancar_o_remoto(repo: Repositorio) -> str:
    """Um segundo clone empurra um commit para o remoto: o principal nao o
    viu, entao a `main` local e a `origin/main` dele ficam ATRAS. Devolve o sha."""
    outro = repo.base / "outro-clone"
    repo.git("clone", "-q", str(repo.remoto), str(outro))
    exemplo = outro / ".env.example"
    exemplo.write_text(exemplo.read_text() + f"{MARCADOR_DO_REMOTO}=\n")
    repo.git("commit", "-q", "-am", "o remoto anda", onde=outro)
    repo.git("push", "-q", "origin", "main", onde=outro)
    return repo.git("rev-parse", "HEAD", onde=outro)


def test_o_worktree_nasce_da_origin_main_buscada_pelo_script(
    repo: Repositorio,
) -> None:
    na_main_local = repo.git("rev-parse", "main")
    no_remoto = _avancar_o_remoto(repo)
    assert no_remoto != na_main_local
    # O principal ainda nao sabe: a origin/main dele esta atras.
    assert repo.git("rev-parse", "origin/main") == na_main_local

    resultado = repo.rodar("fresco")

    assert resultado.returncode == 0, resultado.stderr
    destino = repo.principal / ".claude" / "worktrees" / "fresco"
    assert repo.git("rev-parse", "HEAD", onde=destino) == no_remoto
    assert repo.git("rev-parse", "--abbrev-ref", "HEAD", onde=destino) == "wt/fresco"
    # O fetch do script atualizou a origin/main; a main local nao e tocada.
    assert repo.git("rev-parse", "origin/main") == no_remoto
    assert repo.git("rev-parse", "main") == na_main_local
    # A branch nova nao rastreia a origin/main (um "git push" sem argumento
    # nao deve mirar nela). O script parte de um sha, que o git nao rastreia;
    # partir do nome "origin/main" faria o git configurar o rastreio, e e isto
    # que a asserção guarda.
    rastreio = subprocess.run(
        ["git", "config", "--get", "branch.wt/fresco.remote"],
        cwd=destino,
        env=repo.ambiente,
        capture_output=True,
        text=True,
        check=False,
    )
    assert rastreio.stdout == ""


def test_o_env_example_do_worktree_vem_da_origin_main(repo: Repositorio) -> None:
    _avancar_o_remoto(repo)
    # A main local tem um exemplo DIFERENTE, so local, que nao pode vazar.
    (repo.principal / ".env.example").write_text("FOCUSQUEST_SO_DA_MAIN_LOCAL=\n")
    repo.git("commit", "-q", "-am", "exemplo so local")

    resultado = repo.rodar("fresco")

    assert resultado.returncode == 0, resultado.stderr
    env = (repo.principal / ".claude/worktrees/fresco/.env").read_text()
    assert f"{MARCADOR_DO_REMOTO}=" in env
    assert "FOCUSQUEST_SO_DA_MAIN_LOCAL" not in env


def test_um_commit_so_local_na_main_nao_entra_no_worktree(repo: Repositorio) -> None:
    no_remoto = repo.git("rev-parse", "origin/main")
    (repo.principal / "so-local.txt").write_text("nao publicado\n")
    repo.git("add", "so-local.txt")
    repo.git("commit", "-q", "-m", "so local")

    resultado = repo.rodar("limpo")

    assert resultado.returncode == 0, resultado.stderr
    destino = repo.principal / ".claude/worktrees/limpo"
    assert repo.git("rev-parse", "HEAD", onde=destino) == no_remoto
    assert not (destino / "so-local.txt").exists()


def test_recusa_se_o_fetch_falha_sem_cair_na_main_local(repo: Repositorio) -> None:
    """Sem rede (aqui, um remoto que nao existe) o script recusa: criar da `main`
    local seria nascer de uma revisao velha, em silencio."""
    repo.git("remote", "set-url", "origin", str(repo.base / "nao-existe.git"))
    antes = repo.worktrees()

    resultado = repo.rodar("offline")

    assert resultado.returncode != 0
    assert RECUSA_DO_FETCH in resultado.stderr
    assert "nunca da main local" in resultado.stderr
    assert "nao-existe.git" in resultado.stderr  # o erro do git vem junto
    _nada_foi_criado(repo, antes)
    assert not (repo.principal / ".claude/worktrees/offline").exists()
    assert not (repo.principal / ".superpowers/sdd/worktree-ledgers/offline").exists()


def test_recusa_se_nao_ha_remoto_origin(repo: Repositorio) -> None:
    repo.git("remote", "remove", "origin")
    antes = repo.worktrees()

    resultado = repo.rodar("sem-remoto")

    assert resultado.returncode != 0
    assert RECUSA_DO_FETCH in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_recusa_se_o_remoto_nao_tem_main_mesmo_com_origin_main_antiga(
    repo: Repositorio,
) -> None:
    """O remoto responde, mas sem a branch `main`: a `origin/main` que sobrou
    de um fetch anterior e velha e nao pode servir de base."""
    assert repo.git("rev-parse", "origin/main")
    sem_main = repo.base / "sem-main.git"
    repo.git("init", "-q", "--bare", "-b", "outra", str(sem_main))
    repo.git("push", "-q", str(sem_main), "main:outra")
    repo.git("remote", "set-url", "origin", str(sem_main))
    antes = repo.worktrees()

    resultado = repo.rodar("sem-main")

    assert resultado.returncode != 0
    assert RECUSA_DO_FETCH in resultado.stderr
    _nada_foi_criado(repo, antes)


@pytest.mark.parametrize("estado", ["velha", "ausente"])
def test_o_fetch_atualiza_a_origin_main_mesmo_sem_refspec_de_fetch(
    repo: Repositorio, estado: str
) -> None:
    """Um principal criado com `git clone --bare` nao tem
    `remote.origin.fetch`: ai `git fetch origin main` sai com 0 e so avanca o
    FETCH_HEAD, e a `origin/main` fica velha (ou nem existe). O script pede o
    refspec explicito, entao a base e o commit do remoto nos dois casos."""
    repo.git("config", "--unset-all", "remote.origin.fetch")
    if estado == "ausente":
        repo.git("update-ref", "-d", "refs/remotes/origin/main")
    no_remoto = _avancar_o_remoto(repo)

    resultado = repo.rodar("sem-refspec")

    assert resultado.returncode == 0, resultado.stderr
    destino = repo.principal / ".claude/worktrees/sem-refspec"
    assert repo.git("rev-parse", "HEAD", onde=destino) == no_remoto
    env = (destino / ".env").read_text()
    assert f"{MARCADOR_DO_REMOTO}=" in env


@pytest.mark.parametrize(
    ("argumentos", "trecho"),
    [
        (("99",), "deslocamento invalido '99'"),
        (("1",), "o deslocamento 1 nao esta livre"),
    ],
    ids=["fora-da-faixa", "reivindicado"],
)
def test_as_recusas_locais_vem_antes_do_fetch(
    repo: Repositorio, argumentos: tuple[str, ...], trecho: str
) -> None:
    """Com o remoto inalcancavel, a recusa que o script ja sabia dar sem rede
    continua sendo a dada: o fetch so roda depois de todas as recusas locais
    (deslocamento, banco ocupado, trava)."""
    assert repo.rodar("primeiro").returncode == 0
    repo.git("remote", "set-url", "origin", str(repo.base / "nao-existe.git"))
    antes = repo.worktrees()

    resultado = repo.rodar("segundo", *argumentos)

    assert resultado.returncode != 0
    assert trecho in resultado.stderr
    assert RECUSA_DO_FETCH not in resultado.stderr
    assert repo.worktrees() == antes


def test_recusa_da_trava_vem_antes_do_fetch(repo: Repositorio) -> None:
    repo.git("remote", "set-url", "origin", str(repo.base / "nao-existe.git"))
    _trava(repo).mkdir()

    resultado = repo.rodar("trancado")

    assert resultado.returncode != 0
    assert "outra execucao" in resultado.stderr
    assert RECUSA_DO_FETCH not in resultado.stderr


def test_recusa_de_banco_ocupado_vem_antes_do_fetch(repo: Repositorio) -> None:
    assert repo.rodar("a").returncode == 0
    _trocar_banco(repo.principal / ".claude" / "worktrees" / "a", "focusquest_c_test")
    repo.git("remote", "set-url", "origin", str(repo.base / "nao-existe.git"))
    antes = repo.worktrees()

    resultado = repo.rodar("c")

    assert resultado.returncode != 0
    assert "ja e usado por" in resultado.stderr
    assert RECUSA_DO_FETCH not in resultado.stderr
    assert repo.worktrees() == antes


def test_a_trava_e_liberada_depois_de_uma_recusa_de_fetch(repo: Repositorio) -> None:
    repo.git("remote", "set-url", "origin", str(repo.base / "nao-existe.git"))

    resultado = repo.rodar("offline")

    assert RECUSA_DO_FETCH in resultado.stderr
    assert not _trava(repo).exists()


def test_a_recusa_do_fetch_nao_vaza_credencial_da_url_do_remoto(
    repo: Repositorio,
) -> None:
    """O git costuma repetir a URL do remoto no erro; se ela leva usuario e
    senha, a mensagem do script nao pode carrega-los. Um `git` falso, so para o
    fetch, imprime a URL com o canario -- sem depender de como cada versao do git
    a escreve."""
    canario = f"CANARY-{uuid.uuid4()}"
    git_real = shutil.which("git", path=os.environ["PATH"])
    falso = repo.base / "bin" / "git"
    falso.write_text(
        "#!/bin/sh\n"
        'case " $* " in *" fetch "*)\n'
        f"  echo \"fatal: unable to access 'https://{canario}:{canario}"
        "@h.invalid/r.git/': boom\" >&2\n"
        "  exit 128 ;;\n"
        "esac\n"
        f'exec "{git_real}" "$@"\n'
    )
    falso.chmod(0o755)
    antes = repo.worktrees()

    resultado = repo.rodar("vazamento")

    assert resultado.returncode != 0
    assert RECUSA_DO_FETCH in resultado.stderr
    assert canario not in resultado.stdout + resultado.stderr
    assert "https://***@h.invalid/r.git/" in resultado.stderr
    _nada_foi_criado(repo, antes)


# ---------------------------------------------------------------------------
# Alocacao do deslocamento: o primeiro LIVRE, de verdade (lote 19b)
# ---------------------------------------------------------------------------
#
# "Livre" = nenhum outro worktree o reivindica no `.env` E nenhuma das quatro
# portas que ele implica (API, frontend, falso, galeria) tem alguem escutando.
# Os testes abrem sockets REAIS em portas derivadas da janela propria do teste
# (`Repositorio.bases`), nunca nas portas reais do projeto.


@contextmanager
def _portas_ocupadas(*portas: int) -> Iterator[None]:
    """Alguem escutando em cada porta, em 127.0.0.1, ate o bloco acabar."""
    with ExitStack() as pilha:
        for porta in portas:
            servidor = pilha.enter_context(closing(socket.socket()))
            servidor.bind(("127.0.0.1", porta))
            servidor.listen()
        yield


def _deslocamento_do(repo: Repositorio, nome: str) -> str:
    env = (repo.principal / ".claude" / "worktrees" / nome / ".env").read_text()
    return _valor(env, "FOCUSQUEST_E2E_PORT_OFFSET")


def _reivindicar_a_mao(repo: Repositorio, nome: str, deslocamento: int) -> Path:
    """Um worktree que so reivindica o deslocamento no `.env`: nenhum servidor,
    nenhum `make`, nenhuma sondagem de porta -- e o que um worktree parado de um
    PR ja mesclado faz."""
    destino = repo.principal / ".claude" / "worktrees" / nome
    destino.parent.mkdir(parents=True, exist_ok=True)
    repo.git("worktree", "add", "-q", "-b", f"parado/{nome}", str(destino), "main")
    (destino / ".env").write_text(
        f"FOCUSQUEST_TEST_DATABASE_URL={PREFIXO}focusquest_{nome}_test\n"
        f"FOCUSQUEST_E2E_PORT_OFFSET={deslocamento}\n"
    )
    return destino


def test_dois_repositorios_vivos_nunca_dividem_a_janela_de_portas(
    repo: Repositorio, tmp_path: Path, request: pytest.FixtureRequest
) -> None:
    """Enquanto um repositorio de teste vive, a janela dele nao e entregue a
    outro -- nem a outro processo pytest, que e o caso real (gates de worktrees
    diferentes ao mesmo tempo; issue #167)."""
    (tmp_path / "vizinho").mkdir()
    vizinho = Repositorio(tmp_path / "vizinho")
    request.addfinalizer(vizinho.liberar_portas)

    assert set(vizinho.bases).isdisjoint(repo.bases)


def test_sem_nada_em_uso_o_primeiro_deslocamento_livre_e_1(repo: Repositorio) -> None:
    resultado = repo.rodar("primeiro")

    assert resultado.returncode == 0, resultado.stderr
    assert _deslocamento_do(repo, "primeiro") == "1"
    for base in repo.bases:
        assert str(base + 1) in resultado.stdout
    assert "pulad" not in resultado.stdout


@pytest.mark.parametrize("indice", range(4), ids=NOMES_DAS_PORTAS)
def test_pula_o_deslocamento_cuja_porta_esta_ocupada(
    repo: Repositorio, indice: int
) -> None:
    """Qualquer uma das quatro portas basta para o deslocamento nao servir; a
    saida diz qual porta e por que o 1 ficou para tras."""
    ocupada = repo.bases[indice] + 1

    with _portas_ocupadas(ocupada):
        resultado = repo.rodar("desviado")

    assert resultado.returncode == 0, resultado.stderr
    assert _deslocamento_do(repo, "desviado") == "2"
    assert f"porta {ocupada} em uso" in resultado.stdout
    assert str(repo.bases[indice] + 2) in resultado.stdout


def test_pula_reivindicados_e_ocupados_ate_o_primeiro_livre(
    repo: Repositorio,
) -> None:
    """1 reivindicado, 2 e 3 com porta ocupada: o primeiro livre e o 4."""
    dono = _reivindicar_a_mao(repo, "parado", 1)

    with _portas_ocupadas(repo.bases[1] + 2, repo.bases[3] + 3):
        resultado = repo.rodar("novo")

    assert resultado.returncode == 0, resultado.stderr
    assert _deslocamento_do(repo, "novo") == "4"
    assert str(dono) in resultado.stdout
    assert f"porta {repo.bases[1] + 2} em uso" in resultado.stdout
    assert f"porta {repo.bases[3] + 3} em uso" in resultado.stdout


def test_porta_liberada_volta_a_ser_candidata(repo: Repositorio) -> None:
    """A ocupacao e lida a cada execucao: nada fica gravado de uma vez para a outra."""
    with _portas_ocupadas(repo.bases[0] + 1):
        assert repo.rodar("a").returncode == 0
    assert _deslocamento_do(repo, "a") == "2"

    resultado = repo.rodar("b")

    assert resultado.returncode == 0, resultado.stderr
    assert _deslocamento_do(repo, "b") == "1"


def test_pula_o_deslocamento_reivindicado_por_outro_env_com_as_portas_livres(
    repo: Repositorio,
) -> None:
    """Dois worktrees parados (nenhum servidor de pe) nao podem levar o mesmo
    deslocamento: a reivindicacao no `.env` vale mesmo com as portas livres."""
    _reivindicar_a_mao(repo, "parado-um", 1)
    _reivindicar_a_mao(repo, "parado-dois", 2)

    resultado = repo.rodar("terceiro")

    assert resultado.returncode == 0, resultado.stderr
    assert _deslocamento_do(repo, "terceiro") == "3"
    assert "reivindicado no .env de" in resultado.stdout


def test_mensagem_clara_quando_nao_ha_deslocamento_livre_ate_o_teto(
    repo: Repositorio,
) -> None:
    """Todos os 24 com a porta da API ocupada: recusa, nomeia o intervalo e cada
    porta, ensina a sair e nao cria nada."""
    antes = repo.worktrees()
    todas = [repo.bases[0] + d for d in range(1, TETO_DOS_WORKTREES + 1)]

    with _portas_ocupadas(*todas):
        resultado = repo.rodar("sem-lugar")

    assert resultado.returncode != 0
    assert f"nenhum deslocamento livre de 1 a {TETO_DOS_WORKTREES}" in resultado.stderr
    for porta in (todas[0], todas[-1]):
        assert f"porta {porta} em uso" in resultado.stderr
    assert "git worktree remove" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_sem_deslocamento_livre_a_recusa_conta_reivindicados_e_ocupados(
    repo: Repositorio,
) -> None:
    """O teto vem tambem das portas: com a maior base em 65530, o maior
    deslocamento e 5 (65535 e a ultima porta). 1 e 2 reivindicados no `.env`,
    3 a 5 reivindicados tambem -- nenhuma porta e sondada, o teste nao depende
    do que escuta no topo da faixa."""
    repo.ambiente["FQ_PORTAS_BASE_E2E"] = "65500 65510 65520 65530"
    for deslocamento in range(1, 6):
        _reivindicar_a_mao(repo, f"parado-{deslocamento}", deslocamento)
    antes = repo.worktrees()

    resultado = repo.rodar("sem-lugar")

    assert resultado.returncode != 0
    assert "nenhum deslocamento livre de 1 a 5" in resultado.stderr
    assert str(PORTA_MAXIMA) in resultado.stderr
    assert resultado.stderr.count("reivindicado no .env de") == 5
    _nada_foi_criado(repo, antes)


def test_o_teto_deriva_das_portas_e_vale_para_o_deslocamento_pedido(
    repo: Repositorio,
) -> None:
    """6 esta dentro da reserva dos worktrees (0 a 24), mas 65530 + 6 passa de
    65535: nenhuma porta existe ali."""
    repo.ambiente["FQ_PORTAS_BASE_E2E"] = "65500 65510 65520 65530"
    antes = repo.worktrees()

    resultado = repo.rodar("alto", "6")

    assert resultado.returncode != 0
    assert "deslocamento invalido" in resultado.stderr
    assert "0 a 5" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_deslocamento_pedido_com_porta_ocupada_e_recusado(repo: Repositorio) -> None:
    ocupada = repo.bases[3] + 7
    antes = repo.worktrees()

    with _portas_ocupadas(ocupada):
        resultado = repo.rodar("pedido", "7")

    assert resultado.returncode != 0
    assert "deslocamento 7" in resultado.stderr
    assert f"porta {ocupada} em uso" in resultado.stderr
    _nada_foi_criado(repo, antes)


# O limite da sondagem. Uma porta com DROP no firewall deixaria o connect do
# /dev/tcp pendurado por minutos (e o macOS nao tem `timeout`); o script o
# interrompe sozinho. Nenhum teste depende da rede: `FQ_SONDA_SIMULA` troca o
# connect por uma sonda que trava ("travada") ou que falha com um erro que nao
# e "recusada" ("erro"), e `FQ_SONDA_TIMEOUT` encurta o limite para 1 s.
LIMITE_DA_SONDA_S = 1
FOLGA_DO_LIMITE_S = 8
PARADA_DO_TESTE_S = 30


@pytest.mark.parametrize("simulacao", ["travada", "erro"])
def test_sonda_que_nao_conclui_recusa_o_deslocamento_pedido(
    repo: Repositorio, simulacao: str
) -> None:
    """Resultado nao sondavel (travou ou falhou sem ser recusada) recusa, e a
    sonda travada e cortada no limite em vez de segurar o script."""
    repo.ambiente |= {
        "FQ_SONDA_SIMULA": simulacao,
        "FQ_SONDA_TIMEOUT": str(LIMITE_DA_SONDA_S),
    }
    antes = repo.worktrees()

    inicio = time.monotonic()
    resultado = repo.rodar("nao-sondavel", "3", timeout=PARADA_DO_TESTE_S)
    duracao = time.monotonic() - inicio

    assert resultado.returncode != 0
    assert "o deslocamento 3 nao esta livre" in resultado.stderr
    assert f"porta {repo.bases[0] + 3} nao pode ser sondada" in resultado.stderr
    assert duracao < FOLGA_DO_LIMITE_S
    _nada_foi_criado(repo, antes)


def test_sonda_com_erro_desconhecido_pula_todos_os_deslocamentos(
    repo: Repositorio,
) -> None:
    """Na alocacao automatica, "nao deu para saber" nunca vira "livre": todos os
    deslocamentos ficam para tras, cada um com a porta nomeada."""
    repo.ambiente |= {"FQ_SONDA_SIMULA": "erro"}
    antes = repo.worktrees()

    resultado = repo.rodar("no-escuro", timeout=PARADA_DO_TESTE_S)

    assert resultado.returncode != 0
    assert f"nenhum deslocamento livre de 1 a {TETO_DOS_WORKTREES}" in resultado.stderr
    assert resultado.stderr.count("nao pode ser sondada") == TETO_DOS_WORKTREES
    _nada_foi_criado(repo, antes)


def test_deslocamento_pedido_reivindicado_e_recusado_dizendo_por_quem(
    repo: Repositorio,
) -> None:
    dono = _reivindicar_a_mao(repo, "parado", 7)
    antes = repo.worktrees()

    resultado = repo.rodar("pedido", "7")

    assert resultado.returncode != 0
    assert "deslocamento 7" in resultado.stderr
    assert str(dono) in resultado.stderr
    _nada_foi_criado(repo, antes)


@pytest.mark.parametrize(
    "valor", ["abc", "1 2 3", "1 2 3 4 5", "0 1 2 3", "1 2 3 70000"]
)
def test_recusa_bases_de_porta_invalidas(repo: Repositorio, valor: str) -> None:
    repo.ambiente["FQ_PORTAS_BASE_E2E"] = valor
    antes = repo.worktrees()

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "FQ_PORTAS_BASE_E2E" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_as_portas_base_do_script_sao_as_do_servers_ts() -> None:
    """Duas linguagens, uma verdade: o script sonda as portas que o
    `servers.ts` de fato usa. Se uma mudar sem a outra, a sondagem passa a olhar
    portas que nenhum E2E usa."""
    fonte = SERVERS_TS.read_text()
    do_servers = []
    for nome in ("PORTA_DA_API", "PORTA_DO_WEB", "PORTA_DO_FALSO", "PORTA_DA_GALERIA"):
        achado = re.search(rf"const {nome} = (\d+)", fonte)
        assert achado is not None, nome
        do_servers.append(int(achado.group(1)))
    padrao = re.search(r"FQ_PORTAS_BASE_E2E:-([0-9 ]+)\}", SCRIPT.read_text())

    assert padrao is not None
    assert [int(porta) for porta in padrao.group(1).split()] == do_servers


# ---------------------------------------------------------------------------
# A logica que roda e a da origin/main (issue #194)
# ---------------------------------------------------------------------------
#
# Quem roda e a copia do script do checkout de onde ele e chamado. Num checkout
# parado numa branch antiga, uma versao antiga criava o worktree da base errada.
# Depois do fetch o script compara a propria copia (e a da biblioteca que ele
# carrega) com a da origin/main e recusa se divergirem.


def _checkout_numa_branch_antiga(repo: Repositorio) -> str:
    """Poe o principal numa branch `antiga`, parada no commit atual, e anda a
    origin/main com um commit novo. Devolve o sha novo do remoto."""
    repo.git("switch", "-q", "-c", "antiga")
    return _avancar_o_remoto(repo)


def test_de_uma_branch_antiga_o_worktree_nasce_da_origin_main(
    repo: Repositorio,
) -> None:
    no_remoto = _checkout_numa_branch_antiga(repo)

    resultado = repo.rodar("fresco")

    assert resultado.returncode == 0, resultado.stderr
    destino = repo.principal / ".claude/worktrees/fresco"
    assert repo.git("rev-parse", "HEAD", onde=destino) == no_remoto
    assert repo.git("rev-parse", "--abbrev-ref", "HEAD") == "antiga"


@pytest.mark.parametrize("arquivo", ["novo-worktree.sh", "push-env.sh"])
def test_recusa_se_a_copia_que_roda_diverge_da_origin_main(
    repo: Repositorio, arquivo: str
) -> None:
    _checkout_numa_branch_antiga(repo)
    copia = repo.principal / "scripts" / arquivo
    copia.write_text(copia.read_text() + "# versao antiga\n")
    repo.git("commit", "-q", "-am", "script antigo")
    antes = repo.worktrees()

    resultado = repo.rodar("velho")

    assert resultado.returncode != 0
    assert f"scripts/{arquivo}" in resultado.stderr
    assert "origin/main" in resultado.stderr
    _nada_foi_criado(repo, antes)
    assert not (repo.principal / ".superpowers/sdd/worktree-ledgers/velho").exists()
    assert not _trava(repo).exists()


def test_recusa_se_a_origin_main_nao_tem_o_script(repo: Repositorio) -> None:
    outro = repo.base / "outro-clone"
    repo.git("clone", "-q", str(repo.remoto), str(outro))
    repo.git("rm", "-q", "scripts/novo-worktree.sh", onde=outro)
    repo.git("commit", "-q", "-m", "sem script", onde=outro)
    repo.git("push", "-q", "origin", "main", onde=outro)
    antes = repo.worktrees()

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "scripts/novo-worktree.sh" in resultado.stderr
    _nada_foi_criado(repo, antes)


# ---------------------------------------------------------------------------
# Falha no bootstrap nao deixa registro orfao (issue #194)
# ---------------------------------------------------------------------------


def test_bootstrap_que_falha_desfaz_worktree_branch_e_ledger(
    repo: Repositorio,
) -> None:
    repo.falhar_o_bootstrap()
    antes = repo.worktrees()
    destino = repo.principal / ".claude/worktrees/novo"
    ledger = repo.principal / ".superpowers/sdd/worktree-ledgers/novo"

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "make bootstrap falhou" in resultado.stderr
    assert repo.make_chamado() == [f"-C {destino} bootstrap"]
    assert repo.worktrees() == antes
    assert repo.git("branch", "--list", "wt/*") == ""
    assert not destino.exists()
    assert not ledger.exists()
    assert not _trava(repo).exists()

    # O mesmo nome volta a servir: era o que o ledger orfao impedia.
    repo.consertar_o_bootstrap()
    de_novo = repo.rodar("novo")
    assert de_novo.returncode == 0, de_novo.stderr
    assert destino.as_posix() in repo.worktrees()


def test_bootstrap_que_falha_preserva_o_que_alguem_escreveu(
    repo: Repositorio,
) -> None:
    """O desfazer nao apaga trabalho: um arquivo nao rastreado no worktree faz
    o `git worktree remove` (sem --force) recusar, e um ledger com conteudo
    fica. O script mantem os dois e diz como retomar."""
    repo.falhar_o_bootstrap(
        "echo meu > rascunho.txt && echo nota > .superpowers/sdd/nota.txt"
    )
    destino = repo.principal / ".claude/worktrees/novo"
    ledger = repo.principal / ".superpowers/sdd/worktree-ledgers/novo"

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "make bootstrap falhou" in resultado.stderr
    assert (destino / "rascunho.txt").read_text() == "meu\n"
    assert (ledger / "nota.txt").read_text() == "nota\n"
    assert destino.as_posix() in repo.worktrees()
    assert repo.git("branch", "--list", "wt/novo") != ""
    assert f"git worktree remove {destino}" in resultado.stderr
    assert "git branch -D wt/novo" in resultado.stderr
    assert str(ledger) in resultado.stderr
    assert not _trava(repo).exists()


# ---------------------------------------------------------------------------
# A trava da janela de portas da fixture (issue #196)
# ---------------------------------------------------------------------------


def _janela_esta_travada(trava: IO[str]) -> bool:
    """Tenta travar o MESMO arquivo por outro descritor: o `flock` conflita
    entre descritores abertos separadamente, ate dentro do mesmo processo."""
    with Path(trava.name).open("a") as outra:
        try:
            fcntl.flock(outra, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(outra, fcntl.LOCK_UN)
        return False


def test_o_teardown_libera_a_trava_da_janela(tmp_path: Path) -> None:
    repositorio = Repositorio(tmp_path)
    trava = repositorio._trava_das_portas
    assert _janela_esta_travada(trava)

    repositorio.liberar_portas()

    assert not _janela_esta_travada(trava)


def test_falha_na_construcao_libera_a_trava_da_janela(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reservadas: list[IO[str]] = []
    original = _reservar_janela_de_portas

    def reservar_e_guardar() -> tuple[tuple[int, int, int, int], IO[str]]:
        bases, trava = original()
        reservadas.append(trava)
        return bases, trava

    def copia_quebrada(*_argumentos: object, **_opcoes: object) -> None:
        raise OSError("disco cheio simulado")

    monkeypatch.setattr(f"{__name__}._reservar_janela_de_portas", reservar_e_guardar)
    monkeypatch.setattr(shutil, "copy2", copia_quebrada)

    with pytest.raises(OSError, match="disco cheio simulado"):
        Repositorio(tmp_path)

    assert len(reservadas) == 1
    assert not _janela_esta_travada(reservadas[0])


def test_sem_janela_livre_a_mensagem_diz_onde_estao_as_travas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def tudo_ocupado(_arquivo: object, _operacao: int) -> None:
        raise BlockingIOError

    monkeypatch.setattr(fcntl, "flock", tudo_ocupado)

    with pytest.raises(AssertionError) as erro:
        _reservar_janela_de_portas()

    mensagem = str(erro.value)
    assert "nenhuma janela de portas livre" in mensagem
    assert str(Path(tempfile.gettempdir()) / "kairyaquest-portas-") in mensagem
    assert "48 janelas" in mensagem
