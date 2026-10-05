"""Testes do `scripts/novo-worktree.sh` (pendencia 19).

O script cria um worktree interno ao principal, com banco de teste e portas do
E2E proprios, para dois gates rodarem ao mesmo tempo. Os testes o executam DE
VERDADE, mas num repositorio git temporario: uma copia do script (e da
biblioteca `push-env.sh`, de onde ele tira a reserva de portas do push) fica
em `<tmp>/FocusQuest/scripts/`, e o script resolve o principal a partir do
proprio caminho -- nunca encosta no repositorio real.

O `make` do PATH e falso: registra os argumentos num arquivo e sai com zero.
Assim "roda `make bootstrap`" e verificavel sem `npm ci` nenhum, e "nao roda"
tambem -- uma recusa que chamasse o `make` deixaria rastro.

Nenhum teste conecta em banco: o script so ESCREVE o nome do banco no `.env`;
quem o cria e o gate, no primeiro uso (`test_banco_de_teste.py`).
"""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / "scripts" / "novo-worktree.sh"
BIBLIOTECA = RAIZ / "scripts" / "push-env.sh"

PREFIXO = "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:55432/"
ENV_PRINCIPAL = (
    "# comentario que atravessa\n"
    f"FOCUSQUEST_DATABASE_URL={PREFIXO}focusquest\n"
    f"FOCUSQUEST_TEST_DATABASE_URL={PREFIXO}focusquest_test?options=-c%20x\n"
    "FOCUSQUEST_TUTOR_MODEL=claude-opus-5\n"
)


class Repositorio:
    """O principal temporario, o `make` falso e o jeito de rodar o script."""

    def __init__(self, tmp_path: Path) -> None:
        self.base = tmp_path
        self.principal = tmp_path / "FocusQuest"
        self.registro_do_make = tmp_path / "make-chamado"
        bin_falso = tmp_path / "bin"
        bin_falso.mkdir()
        make_falso = bin_falso / "make"
        make_falso.write_text(f'#!/bin/sh\necho "$@" >> "{self.registro_do_make}"\n')
        make_falso.chmod(0o755)
        self.ambiente = {
            chave: valor
            for chave, valor in os.environ.items()
            if not chave.startswith(("FOCUSQUEST_", "GIT_"))
        } | {
            "PATH": f"{bin_falso}{os.pathsep}{os.environ['PATH']}",
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
        self.git("add", ".")
        self.git("commit", "-q", "-m", "base")
        scripts = self.principal / "scripts"
        scripts.mkdir()
        shutil.copy2(SCRIPT, scripts / "novo-worktree.sh")
        shutil.copy2(BIBLIOTECA, scripts / "push-env.sh")
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

    def rodar(self, *argumentos: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(self.principal / "scripts" / "novo-worktree.sh"), *argumentos],
            cwd=self.base,
            env=self.ambiente,
            capture_output=True,
            text=True,
            check=False,
        )

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
def repo(tmp_path: Path) -> Repositorio:
    return Repositorio(tmp_path)


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
    assert repo.git("rev-parse", "HEAD", onde=destino) == repo.git("rev-parse", "main")

    env = (destino / ".env").read_text()
    # So o NOME do banco de teste muda; servidor, credencial e query ficam.
    assert _valor(env, "FOCUSQUEST_TEST_DATABASE_URL") == (
        f"{PREFIXO}focusquest_medida_test?options=-c%20x"
    )
    assert _valor(env, "FOCUSQUEST_DATABASE_URL") == f"{PREFIXO}focusquest"
    assert _valor(env, "FOCUSQUEST_TUTOR_MODEL") == "claude-opus-5"
    assert "# comentario que atravessa" in env
    # O principal nao declara deslocamento (0); o primeiro livre e 1.
    assert _valor(env, "FOCUSQUEST_E2E_PORT_OFFSET") == "1"

    assert repo.make_chamado() == [f"-C {destino} bootstrap"]
    assert "focusquest_medida_test" in resultado.stdout
    assert "8101" in resultado.stdout
    assert "make check" in resultado.stdout
    # O .env do principal nao muda.
    assert (repo.principal / ".env").read_text() == ENV_PRINCIPAL


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


def test_recusa_sem_env_no_principal(repo: Repositorio) -> None:
    (repo.principal / ".env").unlink()
    antes = repo.worktrees()

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert ".env" in resultado.stderr
    _nada_foi_criado(repo, antes)


def test_recusa_se_o_banco_de_teste_do_principal_nao_termina_em_test(
    repo: Repositorio,
) -> None:
    (repo.principal / ".env").write_text(
        ENV_PRINCIPAL.replace("focusquest_test?", "focusquest?")
    )
    antes = repo.worktrees()

    resultado = repo.rodar("novo")

    assert resultado.returncode != 0
    assert "_test" in resultado.stderr
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
            f"{PREFIXO}focusquest_{nome}_test?options=-c%20x"
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
    repo.git("add", "scripts")
    repo.git("commit", "-q", "-m", "script")
    assert repo.rodar("primeiro").returncode == 0
    primeiro = repo.principal / ".claude/worktrees/primeiro"
    env = primeiro / ".env"
    env.write_text(env.read_text().replace("claude-opus-5", "modelo-do-filho"))
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
    assert (
        _valor((segundo / ".env").read_text(), "FOCUSQUEST_TUTOR_MODEL")
        == "claude-opus-5"
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
