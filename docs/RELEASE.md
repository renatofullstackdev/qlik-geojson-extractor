# Distribuição e release

## Desenvolvimento

Use `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação.

Esse fluxo não é recomendado para usuários finais.

## Chrome Web Store — Unlisted

Opção preferida quando a extensão pode ser instalada por qualquer usuário que possua o link, mas não deve aparecer em busca pública.

Fluxo esperado:

```text
link institucional
  ↓
página da Chrome Web Store
  ↓
Usar no Chrome
```

Antes da submissão:

- execute `npm test`, `npm run build` e `npm run check`;
- confirme `manifest.version`;
- gere um ZIP contendo somente `chrome-extension/`;
- use os ícones fornecidos em `chrome-extension/icons/`;
- utilize `chrome-extension/PRIVACY.md` como base para a declaração de privacidade;
- descreva claramente o propósito único: inspecionar PointLayers Qlik e exportar GeoJSON;
- justifique `activeTab`, `scripting`, `storage`, `downloads`, `sidePanel` e permissões opcionais de host.

## Private / Enterprise

Quando houver administração central do Chrome, avalie:

- publicação privada restrita à organização;
- instalação por política corporativa;
- instalação forçada para grupos específicos.

Isso elimina a necessidade de treinamento sobre `chrome://extensions`.

## Pacote de release

A raiz do projeto inclui ferramentas de desenvolvimento. O pacote da Web Store deve conter somente a pasta `chrome-extension/` e seus arquivos gerados.
