const express = require("express");
const bodyParser = require("body-parser");
const AdmZip = require("adm-zip");
const fs = require("fs-extra");
const fsPromises = require("fs").promises;
const cors = require("cors");
const axios = require("axios");
const url = require("url");
const { request, GraphQLClient } = require("graphql-request");
const { getAllFonts } = require("./graphQLQuery.js");
const { response } = require("express");
const app = express();
const port = 3000;
const assetSrc = "./assets";

app.use(bodyParser.json());
app.use(cors());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use("/public", express.static(__dirname + "/assets"));

// server domain name source:
// https://www.notion.so/piccollage/Domain-Name-Redesign-227d97360aeb4ec59f221931d4a5cda6
const endpoint =
  "https://content.piccollage.com/api/graphql?cbid=fontserver&device_features_enabled=vip_font";
const client = new GraphQLClient(endpoint, { headers: {} });

app.get("/", (request, response) => {
  response.json({ info: "Node.js, Express, and Postgres API" });
});

app.get("/fonts", async (request, response) => {
  const { source } = request.query;
  if (source === "pico") {
    // use the graphQL to get picCollage fonts
    const _ = await client.request(getAllFonts);
    const preview = _?.category?.bundles?.edges?.map((e) => ({
      title: e?.node?.title,
      install_uri: e?.node?.install_source_url,
    }));
    response.status(200).json({ lists: preview });
  } else if (source === "google") {
    // go to google font server and ask from res
    response.status(200).json({ lists: [] });
  } else {
    response.status(404).json({ error: "Invalid Parameter" });
  }
});

app.get("/font", async (request, response) => {
  const { source, family, format } = request.query;
  if (!family) {
    response.status(500).send({ status: "Params: family can't not be empty" });
  }

  if (source === "pico") {
    // use the graphQL Client to get picCollage font zip data uri
    const _ = await client.request(getAllFonts);
    const fontDataUri = _?.category?.bundles?.edges
      ?.filter((e) => e?.node?.title === family)
      ?.map((e) => e?.node?.install_source_url);

    if (fontDataUri.length > 0) {
      // get the font file in the zip data
      const body = await axios.get(`${fontDataUri}`, {
        responseType: "arraybuffer",
      });

      try {
        let files = [];
        const zip = new AdmZip(body.data);
        const fontFileFormat = ["ttf", "otf", "woff", "woff2"];

        for (const zipEntry of zip.getEntries()) {
          const fileName = zipEntry.name;
          console.log("checking...", fileName);
          if (fontFileFormat.some((format) => fileName.includes(format))) {
            const file = {
              data: zip.readFile(zipEntry),
              name: fileName,
            };
            files = [...files, file];
          }
        }
        // TODO: we now only send back the first font file,
        // but we can consider if we are able to send back a file that content multiple font files.
        const returnFontFile = files?.[0];
        // store
        await fsPromises.writeFile(
          `${assetSrc}/${returnFontFile?.name}`,
          returnFontFile?.data,
          (err) => {
            if (err) return console.log(err);
            console.log("store font file failed!");
          }
        );

        // send
        if (format === "base64") {
          const contents = await fs.readFile(
            `${assetSrc}/${returnFontFile?.name}`,
            { encoding: "base64" }
          );
          // response.setHeader('Content-Type', 'font/woff2')
          response.status(200).json({ base64: contents });
        } else {
          response.setHeader("Content-Type", "font/woff2");
          response.download(`${assetSrc}/${returnFontFile?.name}`);
        }
        // response.on("close", () =>
        //   fs.unlink(`${assetSrc}/${returnFontFile?.name}`)
        // );
        return;
      } catch (e) {
        console.log(`Something went wrong. ${e}`);
        response.status(500).send({ status: "Request font file failed" });
        return;
      }
    }
    response.status(500).send({ status: "Params: family can't found." });
    return;
  }
});

app.get("/generate-fonts", async (request, response) => {
  const { source } = request.query;

  // only suitable for Pico Fonts
  // func: generate font (.ttf) and describe file (.css)
  const generatePicoFontData = async (font) => {
    await sleep(1000);
    const fontDataUri = font?.install_uri;
    const body = await axios.get(`${fontDataUri}`, {
      responseType: "arraybuffer",
    });

    try {
      let files = [];
      const zip = new AdmZip(body.data);
      const fontFileFormat = ["ttf", "otf", "woff", "woff2"];

      for (const zipEntry of zip.getEntries()) {
        const fileName = zipEntry.name;
        if (fontFileFormat.some((format) => fileName.includes(format))) {
          const name = fileName.split(".")?.[0];
          const file = {
            data: zip.readFile(zipEntry),
            name,
          };
          files = [...files, file];
        }
      }
      // TODO: we now only send back the first font file,
      // but we can consider if we are able to send back a file that content multiple font files.
      const returnFontFile = files?.[0];
      const fontName = returnFontFile?.name;
      // store
      await fsPromises.writeFile(
        `${assetSrc}/${fontName}.ttf`,
        returnFontFile?.data,
        (err) => {
          if (err) return console.log(err);
          console.log("store font file failed!");
        }
      );
      const requrl = url.format({
        protocol: 'https',
        host: request.get("host"),
      });
      const data = `@font-face {
font-family: "${fontName}";
src: url("${requrl}/public/${fontName}.ttf")
}
`;
      await fsPromises.writeFile(`${assetSrc}/${fontName}.css`, data, (err) => {
        if (err) return console.log(err);
        console.log("store font data file failed!");
      });
      return;
    } catch (e) {
      console.log(`Something went wrong. ${e}`);
      return;
    }
  };

  // fetch all font
  if (source === "pico") {
    // use the graphQL to get picCollage fonts
    const _ = await client.request(getAllFonts);
    const fontList = _?.category?.bundles?.edges?.map((e) => ({
      title: e?.node?.title,
      install_uri: e?.node?.install_source_url,
    }));
    fontList.map(generatePicoFontData);
  }
  response.status(200);
});
app.listen(port, async () => {
  console.log(`App running on port ${port}.`);
  fs.ensureDirSync(assetSrc);
});

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};
