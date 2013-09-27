var fs = require('fs');
var path = require('path');


var FileBrowser = function () {};


FileBrowser.findSoyFiles = function (root) {
  var soy = [];

  var dirname = path.resolve(root);
  var files = fs.readdirSync(dirname);

  files.forEach(function (file) {
    var filename = path.join(dirname, file);
    var stat = fs.statSync(filename)
    if (stat.isDirectory()) {
      soy = soy.concat(FileBrowser.findSoyFiles(filename));
    } else if (/\.soy$/.test(file)) {
      soy.push(filename);
    }
  });

  return soy;
};


module.exports = FileBrowser;
