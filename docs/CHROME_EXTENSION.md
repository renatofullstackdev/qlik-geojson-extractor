# Arquitetura da extensão Chrome

A extensão é uma camada de UI sobre o core; ela não reimplementa QIX.

## Fluxo de execução

```text
clique no ícone
   ↓
service worker registra tab/origem
   ↓
Side Panel
   ↓
usuário autoriza host
   ↓
chrome.scripting (MAIN world)
   ↓
bundle do core
   ↓
Qlik Engine / QIX
```

O bundle da extensão é regenerado por `npm run build`. A extensão injeta sua própria versão antes de cada comando para não depender de um bundle antigo eventualmente colado no DevTools.

## Segurança

`activeTab` identifica a guia acionada. O Side Panel solicita explicitamente apenas o host atual por `chrome.permissions.request()`. Navegação para outra origem exige nova autorização.

## Modo básico/avançado

O modo básico reduz decisões técnicas. O modo avançado mostra proxy virtual, expressões, medidas, overrides e configuração efetiva.

## Localização

Erros e diagnósticos do core usam códigos estruturados. `chrome-extension/lib/i18n.js` é responsável pelas mensagens pt-BR. Há testes que falham se um código novo não possuir tradução.

## Propriedades

A UI oferece seleção filtrada, seleção por tabelas-fonte relacionadas e agregação em lote. Expressões customizadas permanecem separadas dos campos diretos.

## Relatório de diagnóstico

O relatório JSON é diferente do dataset. Ele registra metadados da inspeção, evidências da chave escolhida e contagens/validação da extração para facilitar auditoria e suporte sem obrigar o compartilhamento dos dados extraídos.
