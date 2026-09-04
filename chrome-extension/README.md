# Qlik GeoJSON Extractor — extensão Chrome

Extensão Manifest V3 com Side Panel para o núcleo `qlik-geojson-extractor`.

## Uso

1. abra uma sheet Qlik em que você já esteja autenticado;
2. clique no ícone da extensão;
3. conceda acesso ao host Qlik atual;
4. teste a conexão;
5. inspecione o PointLayer;
6. valide latitude/longitude;
7. escolha explicitamente a chave da entidade física;
8. selecione propriedades;
9. gere e valide o GeoJSON;
10. baixe o GeoJSON e, se necessário, o relatório de diagnóstico.

## Modo básico

O modo básico esconde opções que normalmente são detectadas ou têm defaults seguros. O proxy virtual, expressões personalizadas, medidas, proveniência e overrides ficam no **Modo avançado**.

## Proxy virtual

É o prefixo de caminho configurado no Qlik Proxy Service antes de `/sense/app/`. Exemplo:

```text
https://example.test/finance/sense/app/APP/sheet/SHEET
                         ^^^^^^^^
                         /finance
```

Sem proxy virtual:

```text
https://example.test/sense/app/APP/sheet/SHEET
```

A extensão detecta esse valor automaticamente.

## Coordenadas

A configuração do próprio PointLayer é a primeira fonte de verdade. Referências simples são convertidas para campos; expressões complexas são preservadas. Para campos diretos, a extensão calcula estatísticas e pares distintos antes da extração.

## Chave física

Os candidatos são classificados por comportamento espacial e evidências auxiliares. Um `$key` do Qlik recebe peso pequeno: `$key` significa participação no modelo associativo, não necessariamente identidade geográfica.

A evidência mais importante é quantos valores do candidato mapeiam para **exatamente um par de coordenadas**. Valores com múltiplos pares recebem forte penalidade.

## Propriedades em lote

A UI permite selecionar campos filtrados, selecionar campos relacionados às tabelas da entidade/coordenadas, limpar a seleção e aplicar uma agregação em lote.

## Permissões

- `activeTab`: associa o clique à guia corrente;
- `scripting`: injeta o core após autorização;
- `sidePanel`: interface lateral;
- `storage`: configurações e contexto transitório;
- `downloads`: downloads locais;
- `optional_host_permissions`: torna possível pedir somente o host Qlik atual em runtime.

Não há `host_permissions` permanentes.

## Distribuição

Para desenvolvimento, carregue `chrome-extension/` sem compactação. Para usuários finais, publique a extensão como **Unlisted** ou **Private** na Chrome Web Store, ou distribua via política corporativa. Veja `../docs/RELEASE.md`.
