// `server-only` aborta fora de um Server Component. Nos testes unitários
// corremos em Node puro, pelo que o marcador é substituído por um módulo vazio
// — os módulos continuam a ser os mesmos que a aplicação carrega.
export {};
