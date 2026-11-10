"""Contratos HTTP de `/api/me`. Chaves em ingles: contrato externo (README s3)."""

from pydantic import BaseModel, ConfigDict

from focusquest.core.idioma import Idioma


class MeRead(BaseModel):
    """O que o front precisa do usuario. `locale` e `null` enquanto ele nunca
    escolheu: e o sinal para o front detectar pelo navegador."""

    display_name: str
    locale: Idioma | None


class MeUpdate(BaseModel):
    """Corpo do `PATCH /api/me`. `locale` e obrigatorio e nao aceita `null`:
    nao existe "desescolher" o idioma. Campo extra e recusado (400, ver
    `RotaQueRecusaCampoExtra`), para `display_name`, `id` ou `role` nunca
    passarem calados."""

    model_config = ConfigDict(extra="forbid")

    locale: Idioma
