const express = require("express");
const puppeteer = require("puppeteer");
const fetch = require("node-fetch");
const fs = require("fs");

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

app.get("/run", async (req, res) => {
  try {
    const result = await ejecutarBot();
    res.send(result);
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

async function obtenerCookieValida() {
  for (let i = 0; i < 5; i++) {
    const response = await fetch(config.cookieApi);
    const rawCookie = await response.text();

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setCookie(...JSON.parse(rawCookie));
    await page.goto("https://www.facebook.com/", { waitUntil: "networkidle2" });

    if (page.url().includes("facebook.com")) {
      return { browser, page };
    } else {
      await browser.close();
    }
  }
  throw new Error("No se pudo obtener una cookie válida después de varios intentos.");
}

async function extraerToken(page) {
  await page.goto("https://www.facebook.com/", { waitUntil: "networkidle2" });
  const html = await page.content();
  const tokenMatch = html.match(/"token":"(.*?)"/);
  return tokenMatch ? tokenMatch[1] : null;
}

async function obtenerLink() {
  const res = await fetch(config.linkApi);
  return await res.text();
}

async function publicarConEtiquetas(page, token, link, amigos) {
  await page.goto("https://www.facebook.com/composer/ocelot/async_loader/?publisher=feed", { waitUntil: "networkidle2" });
  await page.waitForTimeout(2000);

  const texto = `${amigos.map(id => `@[${id}]`).join(" ")}\n${link}`;

  await page.evaluate(async (texto) => {
    const composer = document.querySelector('[role="textbox"]');
    if (composer) {
      composer.focus();
      composer.innerText = texto;
    }
  }, texto);

  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
}

async function ejecutarBot() {
  const { browser, page } = await obtenerCookieValida();
  const token = await extraerToken(page);
  if (!token) {
    await browser.close();
    throw new Error("No se pudo extraer el token.");
  }

  const total = config.cantidad_total_amigos;
  const porPublicacion = config.amigos_por_publicacion;
  const tiempo = config.tiempo_entre_publicaciones;

  const resultados = [];

  for (let i = 0; i < total; i += porPublicacion) {
    const amigos = Array.from({ length: porPublicacion }, (_, j) => `1000${i + j}`); // fake IDs para demo
    const link = await obtenerLink();

    await publicarConEtiquetas(page, token, link, amigos);
    resultados.push(`Publicación con ${amigos.length} amigos: OK`);
    await page.waitForTimeout(tiempo);
  }

  await browser.close();
  return resultados.join("\n");
}
