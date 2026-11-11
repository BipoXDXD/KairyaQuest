"""Testes da guarda `scripts/check-handoff.sh`.

Por que existem: o handoff de cada PR mora em `docs/handoff/`, e o
`docs/HANDOFF.md` so muda no PR de consolidacao. Sem a guarda, um PR que
voltasse a editar o HANDOFF traria de volta o conflito de merge que a regra
acabou. Cada teste monta um repositorio git temporario, com a `origin/main`
como ref remota, e roda o script de verdade nele.

Sao testes de processo, nao de banco: moram em `integration/` pelo mesmo
motivo de `test_install_gitleaks.py`.

Os subprocessos rodam sem nenhuma variavel `GIT_*` herdada. Dentro de um hook
(o pre-commit roda `make check`), o git exporta `GIT_DIR` e `GIT_INDEX_FILE`;
herdadas, elas fariam o `git add`/`git config` do repositorio temporario
escrever no indice e no config do repositorio real.
"""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check-handoff.sh"
VARIAVEIS_DO_CI = {"GITHUB_HEAD_REF", "GITHUB_REF_NAME", "FQ_HANDOFF_BASE"}


def _ambiente_isolado(**extra: str) -> dict[str, str]:
    ambiente = {
        chave: valor
        for chave, valor in os.environ.items()
        if not chave.startswith("GIT_") and chave not in VARIAVEIS_DO_CI
    }
    ambiente.update(extra)
    return ambiente


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=repo,
        env=_ambiente_isolado(),
        check=True,
        capture_output=True,
    )


def _commitar(repo: Path, caminho: str, texto: str) -> None:
    arquivo = repo / caminho
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_text(texto)
    _git(repo, "add", caminho)
    _git(repo, "commit", "-q", "-m", f"altera {caminho}")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Repositorio com HANDOFF na main e uma branch de PR saindo dela."""
    _git(tmp_path, "init", "-q", "-b", "main")
    _git(tmp_path, "config", "user.email", "teste@example.invalid")
    _git(tmp_path, "config", "user.name", "Teste")
    _commitar(tmp_path, "docs/HANDOFF.md", "# Handoff\n")
    _git(tmp_path, "update-ref", "refs/remotes/origin/main", "HEAD")
    _git(tmp_path, "switch", "-q", "-c", "wt/um-pr")
    return tmp_path


def _rodar(repo: Path, branch: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(SCRIPT)],
        cwd=repo,
        env=_ambiente_isolado(FQ_HANDOFF_BRANCH=branch),
        capture_output=True,
        text=True,
    )


def test_pr_que_edita_o_handoff_reprova(repo: Path) -> None:
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n\nseção nova\n")

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 1
    assert "docs/handoff/" in resultado.stderr


def test_pr_com_handoff_na_pasta_por_pr_aprova(repo: Path) -> None:
    _commitar(repo, "docs/handoff/2026-11-10-um-pr.md", "# Um PR\n")

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 0


def test_consolidacao_pode_editar_o_handoff(repo: Path) -> None:
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n\nconsolidado\n")

    resultado = _rodar(repo, "wt/consolidar-handoff-2026-11-11")

    assert resultado.returncode == 0


def test_branch_parecida_com_a_consolidacao_nao_escapa(repo: Path) -> None:
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n\nseção nova\n")

    resultado = _rodar(repo, "wt/x-consolidar-handoff")

    assert resultado.returncode == 1


def test_handoff_editado_e_revertido_na_branch_aprova(repo: Path) -> None:
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n\nseção nova\n")
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n")

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 0


def test_main_que_consolidou_depois_da_saida_da_branch_nao_reprova(repo: Path) -> None:
    """A base andou com uma consolidacao do HANDOFF; a branch nao o tocou.

    Prende o `...` (merge-base) do diff: com `..`, a mudanca da main apareceria
    como se fosse da branch e todo PR antigo reprovaria apos uma consolidacao.
    """
    _commitar(repo, "docs/handoff/2026-11-10-um-pr.md", "# Um PR\n")
    _git(repo, "switch", "-q", "main")
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n\nconsolidado na main\n")
    _git(repo, "update-ref", "refs/remotes/origin/main", "HEAD")
    _git(repo, "switch", "-q", "wt/um-pr")

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 0


def _main_consolida_o_handoff(repo: Path, texto: str) -> None:
    """A main consolida o HANDOFF depois que a branch saiu dela."""
    _git(repo, "switch", "-q", "main")
    _commitar(repo, "docs/HANDOFF.md", texto)
    _git(repo, "update-ref", "refs/remotes/origin/main", "HEAD")
    _git(repo, "switch", "-q", "wt/um-pr")


def _mesclar_a_main_sem_commitar(repo: Path, handoff_resolvido: str) -> None:
    """Merge em andamento, como o pre-commit o ve: MERGE_HEAD e indice resolvido."""
    subprocess.run(
        ["git", "merge", "--no-ff", "--no-commit", "origin/main"],
        cwd=repo,
        env=_ambiente_isolado(),
        capture_output=True,
    )
    assert (repo / ".git" / "MERGE_HEAD").exists()
    (repo / "docs" / "HANDOFF.md").write_text(handoff_resolvido)
    _git(repo, "add", "docs/HANDOFF.md")


def test_merge_que_devolve_o_handoff_da_main_aprova_no_estado_staged(
    repo: Path,
) -> None:
    """Branch antiga que editou o HANDOFF mescla a main e fica com a versao dela.

    No pre-commit do merge o HEAD ainda e o commit velho, que edita o HANDOFF;
    o que vai ser commitado, nao.
    """
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n\nseção da fase\n")
    da_main = "# Handoff\n\nseção da fase\n\nconsolidado na main\n"
    _main_consolida_o_handoff(repo, da_main)
    _mesclar_a_main_sem_commitar(repo, da_main)

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 0, resultado.stderr


def test_merge_que_mantem_a_edicao_da_branch_no_handoff_reprova(repo: Path) -> None:
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n\nseção da fase\n")
    _main_consolida_o_handoff(repo, "# Handoff\n\nconsolidado na main\n")
    _mesclar_a_main_sem_commitar(
        repo, "# Handoff\n\nconsolidado na main\n\nseção da fase\n"
    )

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 1
    assert "docs/handoff/" in resultado.stderr


def test_edicao_staged_do_handoff_reprova(repo: Path) -> None:
    (repo / "docs" / "HANDOFF.md").write_text("# Handoff\n\nseção nova\n")
    _git(repo, "add", "docs/HANDOFF.md")

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 1
    assert "docs/handoff/" in resultado.stderr


def test_staged_que_reverte_a_edicao_commitada_aprova(repo: Path) -> None:
    _commitar(repo, "docs/HANDOFF.md", "# Handoff\n\nseção nova\n")
    (repo / "docs" / "HANDOFF.md").write_text("# Handoff\n")
    _git(repo, "add", "docs/HANDOFF.md")

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 0, resultado.stderr


def test_edicao_do_handoff_fora_do_indice_nao_conta(repo: Path) -> None:
    """So o que vai ser commitado conta: mudanca nao staged fica de fora."""
    _commitar(repo, "docs/handoff/2026-11-10-um-pr.md", "# Um PR\n")
    (repo / "docs" / "HANDOFF.md").write_text("# Handoff\n\nrascunho\n")

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode == 0, resultado.stderr


def test_sem_a_base_o_alvo_reprova(repo: Path) -> None:
    _git(repo, "update-ref", "-d", "refs/remotes/origin/main")

    resultado = _rodar(repo, "wt/um-pr")

    assert resultado.returncode != 0


def test_variaveis_git_de_hook_nao_vazam_para_outro_repositorio(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Simula o pre-commit: GIT_DIR e GIT_INDEX_FILE apontando para outro repo."""
    externo = tmp_path / "externo"
    externo.mkdir()
    subprocess.run(
        ["git", "init", "-q", str(externo)], check=True, env=_ambiente_isolado()
    )
    config_antes = (externo / ".git" / "config").read_text()
    monkeypatch.setenv("GIT_DIR", str(externo / ".git"))
    monkeypatch.setenv("GIT_INDEX_FILE", str(externo / ".git" / "index"))
    temporario = tmp_path / "temporario"
    temporario.mkdir()

    _git(temporario, "init", "-q", "-b", "main")
    _git(temporario, "config", "user.email", "teste@example.invalid")
    _git(temporario, "config", "user.name", "Teste")
    _commitar(temporario, "docs/HANDOFF.md", "# Handoff\n")

    assert (externo / ".git" / "config").read_text() == config_antes
    assert not (externo / ".git" / "index").exists()
    assert (temporario / ".git" / "HEAD").exists()
