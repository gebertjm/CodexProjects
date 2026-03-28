import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd(), "dist");
const host = process.env.FORGESHEET_HOST || "127.0.0.1";
const port = Number(process.env.FORGESHEET_PORT || "4173");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const send = (response, statusCode, body, contentType = "text/plain; charset=utf-8") => {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Content-Type": contentType,
    Pragma: "no-cache",
    Expires: "0",
  });
  response.end(body);
};

const resolveTarget = (requestPath) => {
  const pathname = requestPath.split("?")[0] || "/";
  const normalized = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\\/])+/, "");
  const candidate = normalized === "\\" || normalized === "/" ? "index.html" : normalized.replace(/^[/\\]+/, "");
  const filePath = resolve(root, candidate);
  return filePath.startsWith(root) ? filePath : resolve(root, "index.html");
};

const hasDistFiles = async () => {
  if (!existsSync(root)) {
    return false;
  }

  const entries = await readdir(root);
  return entries.length > 0;
};

const server = createServer(async (request, response) => {
  try {
    const target = resolveTarget(request.url || "/");
    let filePath = target;

    if (!existsSync(filePath) || (existsSync(filePath) && statSync(filePath).isDirectory())) {
      filePath = join(root, "index.html");
    }

    const extension = extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";

    response.writeHead(200, {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type": contentType,
      Pragma: "no-cache",
      Expires: "0",
    });

    createReadStream(filePath).pipe(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    send(response, 500, message);
  }
});

if (!(await hasDistFiles())) {
  console.error("ForgeSheet dist output is missing. Run the build before starting the server.");
  process.exit(1);
}

server.listen(port, host, () => {
  console.log(`ForgeSheet preview running at http://${host}:${port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
