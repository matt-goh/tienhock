// forge.config.ts
import path from "path";
import { fileURLToPath } from "url";
import type { ForgeConfig } from "@electron-forge/shared-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ICON_PATH = path.resolve(__dirname, "public", "tienhock.ico");

const config: ForgeConfig = {
  packagerConfig: {
    name: "Tien Hock ERP",
    executableName: "TienHockERP",
    icon: ICON_PATH,
    asar: true,
    extraResource: ["./build"],
    ignore: [
      /\/src\//,
      /\/public\//,
      /\/.cache\//,
      /\/.vscode\//,
      /forge\.config\.js/,
      /README\.md/,
      /tsconfig\.json/,
      /tailwind\.config\.js/,
      /postcss\.config\.js/,
      /\/src\/configs\/production\.js/,
      /\/dev\/.env/,
      /\.test\.js/,
      /\.spec\.js/,
      /\/tests\//,
    ],
    win32metadata: {
      CompanyName: "Tien Hock",
      FileDescription: "Tien Hock ERP System",
      InternalName: "TienHockERP",
      OriginalFilename: "TienHockERP.exe",
      ProductName: "Tien Hock ERP",
    },
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "TienHockERP",
        authors: "Tien Hock",
        exe: "TienHockERP.exe",
        setupExe: "TienHockERP-Setup.exe",
        setupIcon: ICON_PATH,
        iconUrl: ICON_PATH,
        remoteReleases: "https://github.com/matt-goh/tienhockerp",
        noMsi: true,
      },
    },
  ],
};

export default config;
