var async = require('async');
var fs = require('fs');
var soy = require('../../');


module.exports = function (runner, args, callback) {
  var roots_by_target = runner.getAppConfigValue('soy') || {};
  var targets = Object.keys(roots_by_target);

  async.forEach(targets, function (target, callback) {
    var soy_files = [];

    try {
      var roots = roots_by_target[target];
      roots.forEach(function (root) {
        soy_files = soy_files.concat(soy.FileBrowser.findSoyFiles(root));
      });

      var tokenizer = new soy.Tokenizer();
      var tokens = tokenizer.tokenize(soy_files);

      var compiler = new soy.Compiler();
      var js = compiler.compileTokens(tokens);

      fs.writeFileSync(target, js, 'utf8');
      callback(null);
    } catch (err) {
      callback(err);
    }
  }, callback);
};
