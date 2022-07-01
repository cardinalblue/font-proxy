const express = require("express");
const bodyParser = require("body-parser");
const AdmZip = require("adm-zip");
const fs = require("fs").promises;
const axios = require("axios");
const { request, GraphQLClient } = require("graphql-request");
const { getAllFonts } = require("./graphQLQuery.js");
const app = express();
const port = 3000;
const assetSrc = "./assets";

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
const endpoint = "https://store.pic-collage.com/api/graphql?cbid=figmaPlugin";
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
  const { source, family } = request.query;
  if (!family) {
    response.status(500).send({ status: "Params: family can't not be empty" });
  }

  if (source === "pico") {
    // use the graphQL Client to get picCollage font zip data uri
    const _ = await client.request(getAllFonts);
    const fontDataUri = _?.category?.bundles?.edges
      ?.filter((e) => e?.node?.title === family)
      ?.map((e) => e?.node?.install_source_url);
    console.log({ fontDataUri });
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
        console.log({ returnFontFile });
        // store
        await fs.writeFile(
          `${assetSrc}/${returnFontFile?.name}`,
          returnFontFile?.data,
          (err) => {
            if (err) return console.log(err);
            console.log("store font file failed!");
          }
        );
        // send
        response.status(200).download(`${assetSrc}/${returnFontFile?.name}`);
        response.on("close", () =>
          fs.unlink(`${assetSrc}/${returnFontFile?.name}`)
        );
        return
      } catch (e) {
        console.log(`Something went wrong. ${e}`);
        response.status(500).send({ status: "Request font file failed" });
        return
      }
    }
    response.status(500).send({ status: "Params: family can't found." });
  }
});

app.listen(port, async () => {
  console.log(`App running on port ${port}.`);
  await fs.mkdir(assetSrc);
});
