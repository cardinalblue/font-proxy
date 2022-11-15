const { gql } = require("graphql-request")

const getAllFonts = gql`
  query GetFonts {
    category(name: "All font packs") {
      key
      name
      bundles(bundle_type: FONTS, first: null, after: "") {
        total_count
        edges {
          node {
            id
            title
            install_source_url
            bundle_name
            product_id
            thumbnails
            items {
              edges {
                node {
                  url
                  thumbnail
                  ... on FontItem {
                    font_name
                    language_preferences
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

module.exports = { getAllFonts };
