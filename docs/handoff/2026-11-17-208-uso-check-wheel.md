# #208 · Uso do conferidor do wheel

Base `0adeab9a2306b39c76a3b9c8b79e7feb861d376a`.

`check_wheel.py` exige exatamente os caminhos do wheel e de `src`.
Chamadas com argumentos faltantes ou extras agora mostram a instrução
de uso em stderr e saem com código 2 antes da leitura dos arquivos.

Os três casos novos reprovaram com o script da base. Com a correção,
`python -m pytest tests/unit/test_check_wheel.py` aprovou os sete
testes da suíte, incluindo a chamada válida e as falhas de conteúdo.
O gate integral aguarda reserva.
