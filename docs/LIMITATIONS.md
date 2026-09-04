# Limitações

## Geometrias

A versão 1.0 extrai apenas pontos definidos por latitude/longitude. `AreaLayer`, `LineLayer`, polígonos WKT/KML e geocodificação textual ficam fora do escopo.

## Expressões complexas

Expressões Qlik complexas usadas pelo PointLayer são preservadas para extração, mas a análise automática de cardinalidade espacial e candidatos à chave pode ficar limitada quando não há campos diretos de latitude/longitude.

## Inversão latitude/longitude

A ferramenta detecta valores fora dos limites WGS84 e avisa quando a troca dos eixos corrigiria um intervalo inválido. Ela não assume inversão quando ambos os eixos permanecem numericamente válidos; isso exigiria contexto geográfico adicional.

## Sugestão de chave

A confiança é heurística. Uma relação 1:1 com coordenadas é forte evidência técnica, mas não substitui conhecimento semântico sobre o app. Por isso a seleção continua explícita.

## Desempenho da inspeção

A análise espacial detalhada é executada apenas para um conjunto limitado de candidatos promissores, evitando criar hypercubes enormes para todos os campos de apps com centenas de colunas.

## Campos em massa

Selecionar centenas de propriedades pode aumentar muito a largura do hypercube e o tamanho do GeoJSON. A UI avisa, mas não impede a escolha deliberada do usuário.

## Navegadores

A extensão é Manifest V3 e usa Side Panel, permissões opcionais e `chrome.scripting`. O alvo primário é Chrome/Chromium compatível com a versão mínima declarada no manifesto.
