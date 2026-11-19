# #208 · Serializar as receitas do gate local

Base `0adeab9a2306b39c76a3b9c8b79e7feb861d376a` (merge do #234).
O pytest e a preparação do Playwright usam o mesmo banco de teste local.
Com `-j` explícito ou herdado de `MAKEFLAGS`, o Make podia iniciar o
`reset-test-db` do Playwright enquanto o pytest ainda usava o esquema.

`.NOTPARALLEL:` serializa as receitas de cada invocação, preservando os alvos
dos hooks e a ordem do gate. A regra global também funciona no GNU Make
3.81 do macOS. Invocações simultâneas continuam exigindo bancos e portas
distintos. O CI mantém os alvos independentes, cada job com seu ambiente.

A regressão usa as dependências reais de `check` e `check-e2e` com receitas
simuladas que registram a ordem de API, reset e E2E. Exercita tanto
`make -j2 check` quanto `MAKEFLAGS=-j2 make check`.

A reserva curta rodou `.venv/bin/python -B -m pytest -q -p no:cacheprovider
tests/unit/test_make_gate.py`. Os dois casos passaram com o candidato.
O controle negativo registrou `/usr/bin/make`, GNU Make 3.81. Em cópia
isolada do Makefile da base, ambos falharam
porque `reset-test-db` começou antes de `check-api` registrar sua
conclusão. O log do controle negativo foi conferido pelas duas asserções
e pelos identificadores dos casos. O gate completo aguarda a reserva central.
