"""O usuario unico do incremento 1a."""

# Semeado pela migracao (README s8). O recorte de usuario unico e EXPLICITO, e
# nao ha autenticacao improvisada: o dono nao vem de token nem de cabecalho,
# vem daqui.
#
# A constante e o ponto que muda quando houver autenticacao -- cada rota vai
# receber o usuario por dependencia em vez de ler este numero --, e e por isso
# que ela tem nome em vez de aparecer como `1` em cada rota.
USUARIO_UNICO = 1
