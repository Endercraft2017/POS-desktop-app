/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.pos.desktop",
  productName: "POS-System",
  electronVersion: "33.4.11",
  npmRebuild: false,
  directories: {
    output: "release",
  },
  files: ["out/**/*", "package.json"],
  win: {
    target: ["nsis"],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  extraResources: [
    {
      from: "../../node_modules/better-sqlite3/build/Release/better_sqlite3.node",
      to: "better_sqlite3.node",
    },
  ],
};
