# Limitações

## Geometrias

A versão 1.0 extrai apenas `Point`. `AreaLayer`, `LineLayer`, polígonos e linhas permanecem fora do escopo.

PointLayers são aceitos em dois modos:

- latitude/longitude separadas (`isLatLong=true`);
- uma única localização (`isLatLong=false`).

No modo de localização única, a conversão automática para GeoJSON ocorre somente quando o valor resultante está no formato nativo de ponto do Qlik `[longitude, latitude]`. A ferramenta não geocodifica nomes ou endereços e não adivinha WKT ou strings delimitadas arbitrárias.

## Expressões complexas

Expressões Qlik complexas usadas pelo PointLayer são preservadas para extração, inclusive quando não começam por `=`. A análise automática detalhada de cardinalidade e relação 1:1 fica limitada quando a fonte espacial é uma expressão agregada em vez de um campo direto. Nessa situação a confiança espacial dos candidatos permanece `não avaliada`; o sistema não fabrica um alvo de cardinalidade.

## Inversão latitude/longitude

No modo de coordenadas, a ferramenta detecta valores fora dos limites WGS84 e avisa quando a troca dos eixos corrigiria um intervalo inválido. Ela não assume inversão quando ambos os eixos permanecem numericamente válidos; isso exigiria contexto geográfico adicional.

## Sugestão de chave

A confiança é heurística. Uma relação 1:1 com a representação espacial é forte evidência técnica, mas não substitui conhecimento semântico sobre o app. Por isso a seleção continua explícita.

## Desempenho da inspeção

A análise espacial detalhada é executada apenas para um conjunto limitado de candidatos promissores, evitando criar hypercubes enormes para todos os campos de apps com centenas de colunas.

## Campos em massa

Selecionar centenas de propriedades pode aumentar muito a largura do hypercube e o tamanho do GeoJSON. A UI avisa, mas não impede a escolha deliberada do usuário.

## Navegadores

A extensão é Manifest V3 e usa Side Panel, permissões opcionais e `chrome.scripting`. O alvo primário é Chrome/Chromium compatível com a versão mínima declarada no manifesto.
