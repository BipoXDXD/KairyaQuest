# F8 fechamento, PR A: 12 efeitos sonoros (11/11/2026)

**Objetivo:** gerar, escolher e registrar os 12 efeitos da §9 do plano-mestre (Tarefas 1 e 2 de `docs/superpowers/plans/2026-11-11-f8-fechamento.md`).

**Decisões**

- Geração no ElevenLabs (`eleven_text_to_sound_v2`), 2 variações por efeito, saldo já pago, sem recarga. Custo real: 34 créditos na medição + 374 no restante = **408**, abaixo do teto de 600 dado pela coordenação. Nenhuma retomada.
- Variação escolhida por QA objetivo (duração, silêncio, pico): B em mission_done, proposal_arrived, message_sent, trail_step e panel_open; A nas demais.
- `soft_error` e `xp_tick` passaram do true peak de −1,5 dBFS e foram recodificados com −3 dB; está registrado no `docs/AUDIO.md`.
- D22 (trocar o prompt do soft_error e regenerar o roteiro) **não aplicada**: a variação A passou no QA, e regenerar gastaria crédito sem ganho. `recordingScript.ts` e `roteiro.json` ficam como estão.

**Arquivos:** `frontend/public/audio/sfx/*.mp3` (12, ≈107 KB), `frontend/src/shared/audio/sfx.assets.test.ts`, `docs/AUDIO.md` (§2.3 e totais), o plano da F8.

**Estado:** testes de integridade verdes; sabotagens conferidas (mp3 truncado, arquivo extra, linha ausente no AUDIO.md).

**Próximos passos:** PR B (Tarefas 3–6: controles de som, convite, voz na bolha, gatilhos dos efeitos, E2E).

**Pendências:** escuta do dono dos 12 efeitos. Os brutos ficam em `assets-src/audio/raw/sfx/` (fora do Git), caso algum precise de troca.
