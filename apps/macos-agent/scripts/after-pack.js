const path = require('path');
const { finalizeMacApp } = require('./mac-package-utils');

exports.default = async function afterPack(context) {
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  finalizeMacApp(appPath, { root: context.packager.projectDir });
};

module.exports = exports.default;
