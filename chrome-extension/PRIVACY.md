# Política de privacidade — Qlik GeoJSON Extractor

A extensão executa localmente no navegador do usuário.

## Dados acessados

Quando o usuário autoriza um host Qlik, a extensão pode:

- ler metadados do app/sheet necessários à inspeção;
- consultar campos e cardinalidades;
- executar hypercubes QIX necessários à análise e extração;
- gerar GeoJSON em memória.

## Dados armazenados

A extensão armazena localmente apenas configurações de extração por app/sheet. O GeoJSON e os valores extraídos não são persistidos no `chrome.storage`.

## Transmissão

A extensão não transmite dados a serviços externos controlados pelo projeto. As comunicações de dados ocorrem entre o navegador e o host Qlik autorizado pelo próprio usuário.

Links de Google Maps/Waze, quando habilitados, são apenas strings gravadas como atributos do GeoJSON; a extensão não envia as coordenadas a esses serviços durante a geração do arquivo.

## Permissões de host

Hosts HTTP/HTTPS são declarados apenas como permissões opcionais. O usuário concede explicitamente o host Qlik corrente em runtime e pode revogar o acesso pela própria extensão.
