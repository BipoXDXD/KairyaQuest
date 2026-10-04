"""A configuracao vem do ambiente, sem valor embutido para credencial."""

import os
import re
from pathlib import Path

import pytest
from pydantic import SecretStr, ValidationError

from focusquest.core.config import Settings

# A raiz do repositorio, onde mora o `.env.example`.
RAIZ = Path(__file__).resolve().parents[2]


def test_le_a_url_do_banco_do_ambiente(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/d")
    monkeypatch.setenv(
        "FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/t"
    )
    # Sem o chdir, este teste le o .env real do repositorio: com
    # extra="forbid" ativo, qualquer chave FOCUSQUEST_* que alguem acrescente
    # la derruba este teste por um motivo que ele nao afirma testar.
    monkeypatch.chdir(tmp_path)
    settings = Settings()
    assert settings.database_url == "postgresql+psycopg://u:p@h:55432/d"
    assert settings.test_database_url == "postgresql+psycopg://u:p@h:55432/t"


def test_falha_quando_a_url_do_banco_nao_esta_no_ambiente(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("FOCUSQUEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_TEST_DATABASE_URL", raising=False)
    # O Settings le ".env" (caminho relativo) do diretorio de trabalho. Sem
    # o chdir, o .env real do repositorio (README s4) esconderia a
    # falta de configuracao e o teste pararia de testar o que promete.
    monkeypatch.chdir(tmp_path)
    with pytest.raises(ValueError):
        Settings()


def test_falha_quando_ha_variavel_desconhecida_no_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Variavel desconhecida no .env e erro, nao e ignorada em silencio.

    Sem essa politica, digitar "FOCUSQUEST_DATABSE_URL" (sem o "E") no .env
    faria o pydantic engolir a variavel desconhecida e reportar a de sempre
    como ausente -- apontando para o lugar errado do defeito real.

    O arquivo .env precisa existir de verdade neste teste (nao basta
    monkeypatch.setenv): a fonte que le variaveis do os.environ diretamente
    descarta em silencio qualquer chave com o prefixo que nao bate com um
    campo declarado, sem chegar a validacao. So a fonte que le o arquivo
    .env repassa chaves desconhecidas como "extra", que e o que o
    extra="forbid" (padrao do pydantic, sem extra="ignore" aqui) rejeita.
    Isso foi confirmado rodando os dois casos manualmente antes de escrever
    este teste.
    """
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(
        "FOCUSQUEST_DATABASE_URL=postgresql+psycopg://u:p@h:55432/d\n"
        "FOCUSQUEST_TEST_DATABASE_URL=postgresql+psycopg://u:p@h:55432/t\n"
        "FOCUSQUEST_VARIAVEL_INEXISTENTE=qualquer-coisa\n"
    )
    with pytest.raises(ValueError):
        Settings()


_BANCOS = (
    "FOCUSQUEST_DATABASE_URL=postgresql+psycopg://u:p@h:55432/d\n"
    "FOCUSQUEST_TEST_DATABASE_URL=postgresql+psycopg://u:p@h:55432/t\n"
)


def _settings_do_arquivo(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, conteudo: str
) -> Settings:
    """Um `Settings` lido SO de um .env escrito pelo teste.

    Tira do ambiente TODA variavel `FOCUSQUEST_*` presente no processo, nao
    so as de banco e a chave da Anthropic: no pydantic-settings a variavel de
    AMBIENTE vence o arquivo, entao qualquer `FOCUSQUEST_*` que sobrevivesse
    aqui leria o valor do processo, nao o do .env que este teste acabou de
    escrever. O `pre-push` (scripts/check-push.sh + scripts/push-env.sh)
    exporta para o ambiente do gate toda `FOCUSQUEST_*` do .env do clone -- e
    o `.env` copiado do `.env.example` tem `FOCUSQUEST_TUTOR_MAX_TOKENS=2048`
    etc., nao zero. Sem este delenv, `test_limites_da_tutoria_recusam_zero`
    passava em `make check` isolado e reprovava so sob o `pre-push`: o .env
    de teste escrevia "=0", mas a variavel de ambiente exportada (nao-zero)
    vencia, e o `Settings()` nao recusava. Medido em 2026-09-25: com as tres
    variaveis exportadas (valores do `.env.example`), as tres reprovacoes do
    `pre-push` foram reproduzidas fora dele, e o delenv abaixo as fez passar.
    O `chdir` continua tirando o .env real do repositorio da jogada; o
    delenv tira o ambiente. Isto NAO toca a guarda de sessao de
    `tests/conftest.py` (`FOCUSQUEST_ANTHROPIC_BASE_URL`): o `monkeypatch`
    deste teste restaura o ambiente no teardown, entao a guarda volta a
    valer para o proximo teste -- o mesmo mecanismo que
    `test_padroes_da_tutoria` ja usa para o mesmo fim.
    """
    for chave in list(os.environ):
        if chave.startswith("FOCUSQUEST_"):
            monkeypatch.delenv(chave, raising=False)
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(_BANCOS + conteudo)
    return Settings()


def test_a_chave_da_anthropic_e_opcional(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Sem chave, o Settings carrega: a ausencia e um estado do produto
    (a Tifa indisponivel, README s14), nao configuracao esquecida."""
    assert _settings_do_arquivo(monkeypatch, tmp_path, "").anthropic_api_key is None


def test_chave_vazia_no_env_conta_como_ausente(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A linha do .env.example e `FOCUSQUEST_ANTHROPIC_API_KEY=`, vazia.

    Sem `env_ignore_empty`, ela viraria `SecretStr("")`, e a tela diria que a
    Tifa esta disponivel ate a primeira mensagem receber 401.
    """
    settings = _settings_do_arquivo(
        monkeypatch, tmp_path, "FOCUSQUEST_ANTHROPIC_API_KEY=\n"
    )
    assert settings.anthropic_api_key is None


def test_a_chave_nao_aparece_na_representacao(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    settings = _settings_do_arquivo(
        monkeypatch, tmp_path, "FOCUSQUEST_ANTHROPIC_API_KEY=sk-ant-segredo\n"
    )
    assert settings.anthropic_api_key == SecretStr("sk-ant-segredo")
    assert "sk-ant-segredo" not in repr(settings)
    assert "sk-ant-segredo" not in str(settings)


def test_o_nivel_de_log_e_campo_declarado_do_settings(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """`FOCUSQUEST_LOG_LEVEL` no .env nao pode derrubar o `Settings` com
    `extra_forbidden`: o campo vem de `ConfiguracaoDeLog`, que o `Settings`
    herda -- um lugar so onde o nivel e declarado e validado."""
    settings = _settings_do_arquivo(
        monkeypatch, tmp_path, "FOCUSQUEST_LOG_LEVEL=warning\n"
    )
    assert settings.log_level == "WARNING"


def test_padroes_da_tutoria(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Os padroes da spec -- e o endereco da API escrito por extenso.

    O `delenv` desfaz, so neste teste, a guarda de `tests/conftest.py`: e o
    unico jeito de ler o padrao de verdade.
    """
    monkeypatch.delenv("FOCUSQUEST_ANTHROPIC_BASE_URL", raising=False)
    settings = _settings_do_arquivo(monkeypatch, tmp_path, "")
    assert settings.anthropic_base_url == "https://api.anthropic.com"
    assert settings.tutor_model == "claude-opus-5"
    assert settings.tutor_max_tokens == 2048
    assert settings.tutor_timeout_seconds == 60
    assert settings.tutor_history_messages == 20
    # O fallback da recusa vem LIGADO por decisao do dono (pendencia 174).
    assert settings.tutor_fallback is True


@pytest.mark.parametrize(("valor", "esperado"), [("false", False), ("true", True)])
def test_o_fallback_da_recusa_desliga_pelo_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, valor: str, esperado: bool
) -> None:
    """`FOCUSQUEST_TUTOR_FALLBACK=false` e a saida de emergencia se o beta do
    fallback mudar e a API passar a recusar a requisicao (pendencia 174)."""
    settings = _settings_do_arquivo(
        monkeypatch, tmp_path, f"FOCUSQUEST_TUTOR_FALLBACK={valor}\n"
    )
    assert settings.tutor_fallback is esperado


def test_o_fallback_da_recusa_recusa_valor_que_nao_e_booleano(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Um `talvez` nao liga nem desliga: e erro na partida, e nao um padrao
    escolhido em silencio."""
    with pytest.raises(ValidationError) as erro:
        _settings_do_arquivo(
            monkeypatch, tmp_path, "FOCUSQUEST_TUTOR_FALLBACK=talvez\n"
        )
    assert [(e["loc"], e["type"]) for e in erro.value.errors()] == [
        (("tutor_fallback",), "bool_parsing")
    ]


def test_o_env_example_traz_os_padroes_da_tutoria() -> None:
    """O `.env` nasce copiado do `.env.example`, e o arquivo VENCE o padrao do
    `Settings`: um numero velho no exemplo anularia a mudanca do padrao para
    quem copiar. Por isso os dois andam juntos (pendencia 173: o teto subiu
    de 1024 para 4096 e o exemplo tinha 1024; depois desceu para 2048)."""
    linhas = dict(
        linha.split("=", 1)
        for linha in (RAIZ / ".env.example").read_text().splitlines()
        if linha.startswith("FOCUSQUEST_TUTOR_")
    )
    campos = Settings.model_fields
    assert linhas == {
        "FOCUSQUEST_TUTOR_MODEL": str(campos["tutor_model"].default),
        "FOCUSQUEST_TUTOR_MAX_TOKENS": str(campos["tutor_max_tokens"].default),
        "FOCUSQUEST_TUTOR_TIMEOUT_SECONDS": str(
            int(campos["tutor_timeout_seconds"].default)
        ),
        "FOCUSQUEST_TUTOR_HISTORY_MESSAGES": str(
            campos["tutor_history_messages"].default
        ),
        "FOCUSQUEST_TUTOR_FALLBACK": str(campos["tutor_fallback"].default).lower(),
    }


@pytest.mark.parametrize(
    "linha",
    [
        "FOCUSQUEST_TUTOR_MAX_TOKENS=0",
        "FOCUSQUEST_TUTOR_TIMEOUT_SECONDS=0",
        "FOCUSQUEST_TUTOR_HISTORY_MESSAGES=0",
    ],
)
def test_limites_da_tutoria_recusam_zero(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, linha: str
) -> None:
    """Zero tokens, zero segundos ou zero mensagens de historico nao sao uma
    configuracao: sao um defeito que so apareceria na primeira conversa."""
    with pytest.raises(ValueError):
        _settings_do_arquivo(monkeypatch, tmp_path, linha + "\n")


def test_a_suite_nunca_aponta_para_a_anthropic() -> None:
    """A guarda de `tests/conftest.py` vale para todo teste.

    A chave de verdade mora no Keychain do macOS, nunca no .env (decisao
    D-a); a guarda protege contra uma chave posta por engano no ambiente ou
    no .env, e contra o `pre-push`, que exporta toda `FOCUSQUEST_*` do .env.
    Com a guarda, um teste que esquecesse o override do provedor bateria numa
    porta fechada, e nao numa chamada paga.
    """
    assert Settings().anthropic_base_url == "http://127.0.0.1:9"


def test_a_guarda_vale_com_a_chave_exportada_no_ambiente(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A chave real vive no Keychain e entra no AMBIENTE dos comandos manuais.
    Um `make check` rodado num shell que a exportou herda a
    variavel: o provedor da suite tem de continuar numa porta fechada."""
    monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_API_KEY", "sk-ant-api03-parece-de-verdade")
    settings = Settings()
    assert settings.anthropic_api_key is not None
    assert settings.anthropic_base_url == "http://127.0.0.1:9"


# ---------------------------------------------------------------------------
# Deslocamento das portas do E2E (pendencia 19)
# ---------------------------------------------------------------------------

SERVERS_TS = (
    Path(__file__).resolve().parents[2] / "frontend" / "tests" / "e2e" / "servers.ts"
)
PUSH_ENV = Path(__file__).resolve().parents[2] / "scripts" / "push-env.sh"


def test_o_deslocamento_das_portas_do_e2e_e_zero_por_padrao(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Quem nao configura nada ve as portas de sempre (8100, 5273, 8150)."""
    assert _settings_do_arquivo(monkeypatch, tmp_path, "").e2e_port_offset == 0


def test_o_deslocamento_das_portas_do_e2e_vem_do_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Campo declarado: sem ele, o `.env` de um worktree com a linha seria
    recusado inteiro por `extra_forbidden`."""
    settings = _settings_do_arquivo(
        monkeypatch, tmp_path, "FOCUSQUEST_E2E_PORT_OFFSET=7\n"
    )
    assert settings.e2e_port_offset == 7


@pytest.mark.parametrize("valor", ["-1", "50", "abc", "1.5"])
def test_o_deslocamento_das_portas_do_e2e_recusa_fora_da_faixa(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, valor: str
) -> None:
    """Fora de 0..49 as faixas das portas se sobrepoem: com 50, a API
    (8100 + 50) cairia na porta do falso de quem usa 0 (8150).

    O TIPO do erro e conferido, e nao so o nome do campo: sem o campo
    declarado, a mesma linha tambem reprova -- por `extra_forbidden`, que cita
    o mesmo nome. Afirmar so o nome deixaria este teste verde sem a validacao.
    """
    with pytest.raises(ValidationError) as erro:
        _settings_do_arquivo(
            monkeypatch, tmp_path, f"FOCUSQUEST_E2E_PORT_OFFSET={valor}\n"
        )
    assert [(e["loc"], e["type"]) for e in erro.value.errors()] == [
        (
            ("e2e_port_offset",),
            {"-1": "greater_than_equal", "50": "less_than_equal"}.get(
                valor, "int_parsing"
            ),
        )
    ]


def test_o_limite_do_deslocamento_e_o_mesmo_do_servers_ts() -> None:
    """Duas linguagens, um limite: o `servers.ts` o DERIVA das portas-base (o
    deslocamento maximo e o vao entre a API e o falso, menos um), e o
    `Settings` o declara. Se alguem mudar uma porta-base no TypeScript, este
    teste acusa o limite do Python que ficou para tras."""
    fonte = SERVERS_TS.read_text()

    def porta(nome: str) -> int:
        achado = re.search(rf"^const {nome} = (\d+)$", fonte, re.MULTILINE)
        assert achado is not None, nome
        return int(achado.group(1))

    maximo_do_ts = porta("PORTA_DO_FALSO") - porta("PORTA_DA_API") - 1
    limites = Settings.model_fields["e2e_port_offset"].metadata
    assert [getattr(m, "ge", None) for m in limites if hasattr(m, "ge")] == [0]
    assert [getattr(m, "le", None) for m in limites if hasattr(m, "le")] == [
        maximo_do_ts
    ]
    assert "DESLOCAMENTO_MAXIMO = PORTA_DO_FALSO - PORTA_DA_API - 1" in fonte


def test_a_reserva_do_push_divide_a_faixa_ao_meio() -> None:
    """A faixa de 0 ao limite do `Settings` se divide em duas metades iguais:
    0..24 para worktrees e 25..49 para o pre-push, que soma a reserva ao
    deslocamento do worktree (`scripts/push-env.sh`). Se o limite mudar e a
    reserva nao, o push de um worktree alto sairia da faixa -- ou a faixa dos
    worktrees invadiria a do push."""
    achado = re.search(r"^FQ_RESERVA_DO_PUSH=(\d+)$", PUSH_ENV.read_text(), re.M)
    assert achado is not None
    reserva = int(achado.group(1))
    limites = Settings.model_fields["e2e_port_offset"].metadata
    teto = next(m.le for m in limites if hasattr(m, "le"))
    assert 2 * reserva - 1 == teto
