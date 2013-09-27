var async = require('async');
var soy = require('../../');


module.exports = function (runner, args, callback) {
  var roots_by_target = runner.getAppConfigValue('soy') || {};
  var targets = Object.keys(roots_by_target);

  async.forEach(targets, function (target, callback) {
    var soy_files = [];

    var roots = roots_by_target[target];
    roots.forEach(function (root) {
      soy_files = soy_files.concat(soy.FileBrowser.findSoyFiles(root));
    });

    var compiler = new soy.Compiler();
    compiler.compile(soy_files, callback);
  }, callback);
};
