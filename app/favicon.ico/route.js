const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#202a2a"/><text x="32" y="42" text-anchor="middle" font-family="Georgia,serif" font-size="27" font-weight="700" letter-spacing="-2"><tspan fill="#f2f7f4">A</tspan><tspan fill="#d9bc8d">S</tspan></text></svg>`;

export function GET() {
  return new Response(icon, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache, no-store, must-revalidate"
    }
  });
}
