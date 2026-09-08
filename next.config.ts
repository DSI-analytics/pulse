import os from "node:os";
import type { NextConfig } from "next";

/**
 * Origens autorizadas a carregar os recursos internos do servidor de
 * desenvolvimento (`/_next/*`, HMR).
 *
 * `next dev` já escuta em `0.0.0.0`, pelo que outro computador da rede alcança
 * `http://SEU_IP:3000`. Mas o Next bloqueia por omissão os pedidos aos recursos
 * de desenvolvimento vindos de uma origem diferente daquela com que o servidor
 * arrancou: sem esta lista a página abre e fica sem JavaScript.
 *
 * Autorizamos as gamas privadas RFC 1918 (as redes locais) em vez de IPs fixos,
 * porque o IP muda com o DHCP. Isto **não** abre a aplicação à Internet — quem
 * decide quem chega à porta 3000 é a firewall — e **não** tem qualquer efeito
 * em produção: `allowedDevOrigins` só é lido por `next dev`.
 *
 * Para autorizar outra origem (um nome de máquina, um túnel), defina
 * `DEV_ALLOWED_ORIGINS` no `.env` com valores separados por vírgulas.
 */
function devOrigins(): string[] {
  const hostname = os.hostname().toLowerCase();

  const privateRanges = [
    "192.168.*.*", // 192.168.0.0/16 — redes domésticas e de escritório
    "10.*.*.*", // 10.0.0.0/8
    ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`), // 172.16.0.0/12
  ];

  const extra = (process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  // Também pelo nome da máquina (http://nome:3000) e pelo nome mDNS.
  return [...privateRanges, hostname, `${hostname}.local`, ...extra];
}

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle in .next/standalone for Docker/VPS
  // hosting. Managed platforms (Vercel, Netlify) ignore this safely.
  output: "standalone",

  allowedDevOrigins: devOrigins(),

  // Healthcare data: conservative defaults for anything served by the app.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
