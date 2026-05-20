# morning module

Gera o brief matinal consolidando o estado atual do vault.

## Saída

`60_Agents/5_Inbox/YYYYMMdd-morning.md` — ou stdout com `--dry-run`.

## Entrada

Chama `scanVault()` e agrega:
- Projetos ativos com tipo e progresso
- Tasks urgentes (por data ou prioridade)
- Agentes configurados e frequência de execução

## Uso

```bash
npm run morning        # escreve no vault
npm run morning:dry    # imprime no terminal (sem escrever)
```
