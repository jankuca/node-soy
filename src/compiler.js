var JSDocParser = require('jsdoc-parser');


var Compiler = function () {
  this.open_commands_ = null;
  this.provides_ = null;
  this.scopes_ = null;
};


Compiler.COMMON_TYPES = [
  'string', 'number', 'boolean', 'function', 'undefined', 'null'
];


Compiler.prototype.compileTokens = function (tokens) {
  this.open_commands_ = [];
  this.provides_ = [];
  this.requires_ = [];
  this.scopes_ = [];

  var code_chunks = tokens.map(function (token) {
    var indentation_level = this.open_commands_.length;
    var indentation = '';
    for (var i = 0; i < indentation_level; ++i) {
      indentation += '  ';
    }

    var output = '';
    switch (token.type) {
    case 'jsdoc':
      output = this.compileJSDocToken_(token);
      break;

    case 'command':
      output = this.compileCommandToken_(token);
      break;

    case 'code':
      output = this.compileCodeToken(token);
      break;

    default:
      throw new Error('Unknown token type: ' + token.type);
    }

    if (output === null) {
      return '';
    }

    if (this.open_commands_.length < indentation_level) {
      indentation_level = this.open_commands_.length;
      indentation = '';
      for (var i = 0; i < indentation_level; ++i) {
        indentation += '  ';
      }
    }

    return indentation + output + '\n';
  }, this);


  var result = '';
  if (this.provides_.length !== 0) {
    result += this.provides_.map(function (symbol) {
      return 'goog.provide("' + symbol + '");';
    }).join('\n') + '\n\n';
  }
  if (this.requires_.length !== 0) {
    result += this.requires_.map(function (symbol) {
      return 'goog.require("' + symbol + '");';
    }).join('\n') + '\n';
  }
  result += 'goog.require("goog.array");\n\n';
  result += code_chunks.join('');
  return result;
};


Compiler.prototype.compileJSDocToken_ = function (token) {
  if (this.open_commands_.length !== 0) {
    throw new Error('Unexpected jsdoc: ' + token.source);
  }

  var comment_content = token.source.substr(2, token.source.length - 4);
  var template_jsdoc = JSDocParser.parse(comment_content);
  var jsdoc = '/**';
  if (template_jsdoc.description) {
    jsdoc += '\n * ' + template_jsdoc.description.replace(/\n/g, '\n * ');
  }

  jsdoc += '\n * @param {{ '
  var template_annotations = template_jsdoc.annotations;
  if (template_annotations['params']) {
    var requires = this.requires_;
    jsdoc += template_annotations['params'].map(function (param) {
      var composite_type = param.type.substr(1, param.type.length - 2);

      var base_types = this.parseCompositeType_(composite_type);
      base_types.forEach(function (type) {
        if (requires.indexOf(type) === -1) {
          requires.push(type);
        }
      });

      return param.name + ': ' + composite_type;
    }, this).join(', ');
  }
  jsdoc += ' }} data Data to map to template variables.';

  jsdoc += '\n * @param {!Object.<string, function(string): string>} ' +
      '_helpers Helper functions.'

  jsdoc += '\n * @return {string} Template rendering.'

  return jsdoc + '\n */';
};


Compiler.prototype.compileCommandToken_ = function (token) {
  var closing = (token.source[1] === '/');
  var match = token.source.substr(closing ? 2 : 1).match(/^[a-zA-Z]\w*/);
  var command = match ? match[0] : null;
  var prefix_length = (closing ? 2 : 1) + (command ? command.length : 0);

  command = command || 'print';

  if (!closing) { // command start
    // "{" + command + "\s"
    var exp = token.source.substr(prefix_length + 1)
      .trimLeft()
      .replace(/\}$/, '') || null;
    return this.compileCommandStart_(command, exp);

  } else { // command end
    // "{/" + command + "}"
    if (token.source.length > prefix_length + 1) {
      throw new Error(
          'Syntax Error: Closing commands do not accept expressions');
    }

    var last_open_command = this.open_commands_[0];
    if (command !== last_open_command) {
      throw new Error(
          'Syntax Error: Unexpected closing command "' + command + '", ' +
          '"' + last_open_command + '" has not been closed');
    }

    return this.compileCommandEnd_(command);
  }
};


Compiler.prototype.compileCommandStart_ = function (command, exp) {
  var output;
  var block_command = false;

  switch (command) {
  case 'foreach':
    var exp_parts = exp.split(/\s+/);
    if (exp_parts[0][0] !== '$') {
      throw new Error(
          'Syntax Error: {foreach} command expecting a variable name ' +
          'but got "' + exp_parts[0] + '"');
    }
    if (exp_parts[1] !== 'in') {
      throw new Error(
          'SyntaxError: Unexpected token "' + exp_parts[1] + '" in {foreach}');
    }
    if (exp_parts[2][0] !== '$') {
      throw new Error(
          'Syntax Error: {foreach} command expecting a variable name ' +
          'but got "' + exp_parts[2] + '"');
    }
    var source_var = this.compileVariables_(exp_parts[2]);
    output = 'if (' + source_var + ') { goog.array.forEach(' +
        source_var + ', ' +
        'function (' + exp_parts[0].substr(1) + ', index) {';
    this.scopes_.unshift([ exp_parts[0].substr(1) ]);
    block_command = true;
    break;

  case 'if':
    exp = this.compileVariables_(exp);
    output = 'if (' + exp + ') {';
    block_command = true;
    break;

  case 'else':
    if (exp) {
      throw new Error('SyntaxError: {else} does not accept expressions.');
    }
    output = '} else {';
    break;

  case 'print':
    exp = this.compileVariables_(exp);
    output = 'rendering += ' + exp + ';';
    break;

  case 'template':
    output = exp + ' = function (data, _helpers) { var rendering = "";';
    block_command = true;

    var ns = exp.replace(/\.\w+$/, '');
    if (this.provides_.indexOf(ns) === -1) {
      this.provides_.push(ns);
    }
    break;
  }

  if (block_command) {
    this.open_commands_.unshift(command);
  }

  return output;
};


Compiler.prototype.compileCommandEnd_ = function (command) {
  var output;

  switch (command) {
  case 'foreach':
    output = '}); }';
    this.scopes_.shift();
    break;
  case 'if':
    output = '}';
    break;
  case 'template':
    output = 'return rendering; };';
    break;
  default:
    throw new Error(
        'Syntax Error: Unexpected closing command "' + command + '"');
  }

  this.open_commands_.shift();
  return output;
};


Compiler.prototype.compileCodeToken = function (token) {
  if (this.open_commands_.length === 0 && /^\s*$/.test(token.source)) {
    return null;
  }

  return 'rendering += "' + token.source.replace(/"/g, '\\"') + '";';
};


Compiler.prototype.compileVariables_ = function (str) {
  var scopes = this.scopes_;
  str = str.replace(/\$([a-zA-Z]\w*)/g, function (match, name) {
    for (var i = 0, ii = scopes.length; i < ii; ++i) {
      var scope = scopes[i];
      if (scope.indexOf(name) !== -1) {
        return name;
      }
    }
    return 'data.' + name;
  });

  return str;
};


Compiler.prototype.parseCompositeType_ = function (composite) {
  var types = [];

  var i = 0;
  var len = composite.length;
  var type = '';

  while (i < len) {
    var ch = composite[i++];
    var chc = ch.charCodeAt(0);

    var alphanumeric = (
        chc >= 48 && chc <= 57 ||
        chc >= 65 && chc <= 90 ||
        chc >= 97 && chc <= 122);
    var chaining = (ch === '_' || ch === '.');
    var special = (
        ch === '!' || ch === '<' || ch === '>' || ch === ',' || ch === '|');
    var white = /\s/.test(ch);

    if (alphanumeric || chaining) {
      type += ch;
    } else if (special || white) {
      if (type) {
        type = type.replace(/\.$/, '');
        types.push(type);
        type = '';
      }
    } else {
      throw new Error('Invalid character in composite type "' + ch + '"');
    }
  }

  if (type) {
    type = type.replace(/\.$/, '');
    types.push(type);
  }

  types = this.stripCommonTypes_(types);

  return types;
};


Compiler.prototype.stripCommonTypes_ = function (types) {
  return types.filter(function (type) {
    var primitive = (Compiler.COMMON_TYPES.indexOf(type) !== -1);
    if (primitive) {
      return false;
    }

    var Type = global;
    var levels = type.split('.');
    for (var l = 0, ll = levels.length; l < ll; ++l) {
      Type = Type[levels[l]];
      if (!Type) {
        return true;
      }
    }

    return (typeof Type !== 'function');
  });
};


module.exports = Compiler;
