/**
 * Copyright (c) 2013 Alexander Beletsky
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without restriction, 
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, 
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is 
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or 
 * substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING 
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND 
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES 
 * OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN 
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

let toml = (function () {
  let parseGroup = function (context, str) {
    let result = context.result;
    let current = result;
    let group = parseGroupName (str);
    let groups = parseSubGroups (group);
    addGroups (groups);

    function parseGroupName (str) {
      let start = str.indexOf ('['), end = str.indexOf (']');
      return str.substring (start + 1, end);
    }

    function parseSubGroups (str) {
      return str.split ('.');
    }

    function addGroup (group) {
      if (current[group]) {
        current = current[group];
      } else {
        current = current[group] = {};
      }
      context.currentGroup = current;
    }

    function addGroups (groups) {
      groups.forEach (function (current) {
        addGroup (current);
      });
    }
  };

  let parseExpression = function (context, line) {
    let pair = parseNameValueGroup (line);
    let value = parseValue (pair.value);
    let currentGroup = getCurrentGroup (context, pair.group);
    currentGroup[pair.name] = value;

    function getCurrentGroup (context, groups) {
      let current = context.currentGroup || context.result;
      groups.forEach (function (group) {
        if (current[group]) {
          current = current[group];
        } else {
          current = current[group] = {};
        }
      });
      return current;
    }

    function parseNameValueGroup (line) {
      let equal = line.split ('=');
      equal[0] = equal[0].split ('.');
      temp = [];
      let seenMark = false;
      let start = 0;
      for (let index = 0; index < equal[0].length; ++index) {
        if (!seenMark & (equal[0][index].indexOf ('"') > -1)) {
          seenMark = true;
          seen = index;
        } else if (seenMark & (equal[0][index].indexOf ('"') > 0)) {
          seenMark = false;
          let comb = equal[0].slice (start, index + 1).join ('.');
          temp.push (comb);
        } else if (!seenMark) {
          temp.push (equal[0][index]);
        }
      }
      equal[0] = temp;

      return {
        group: equal[0].slice (0, equal[0].length - 1),
        name: equal[0][equal[0].length - 1],
        value: equal.slice (1, equal.length).join ('='),
      };
    }

    function parseValue (value) {
      if (array (value)) {
        return parseArray (value);
      }

      if (object (value)) {
        return parseObject (value);
      }

      return parsePrimitive (value);

      function array (value) {
        return (
          value.charAt (0) === '[' && value.charAt (value.length - 1) === ']'
        );
      }

      function object (value) {
        return (
          value.charAt (0) === '{' && value.charAt (value.length - 1) === '}'
        );
      }
    }

    function parseObject (value) {
      let values = parseObjectValues (value);
      return values.map (function (v) {
        return parseExpression (context, v);
      });

      function parseObjectValues (value) {
        let parsed = [];
        let array = value.substring (1, value.length - 1);
        let map = commasMap (array);
        map.reduce (function (prev, next) {
          let entry = array.substring (prev + 1, next);
          if (entry) {
            parsed.push (array.substring (prev + 1, next));
          }
          return next;
        }, -1);

        return parsed;
      }
    }

    function parseArray (value) {
      let values = parseArrayValues (value);
      return values.map (function (v) {
        return parseValue (v);
      });

      function parseArrayValues (value) {
        let parsed = [];
        let array = value.substring (1, value.length - 1);
        let map = commasMap (array);
        map.reduce (function (prev, next) {
          let entry = array.substring (prev + 1, next);
          if (entry) {
            parsed.push (array.substring (prev + 1, next));
          }
          return next;
        }, -1);

        return parsed;
      }
    }

    function commasMap (value) {
      let map = [];
      let depth = 0;
      for (let index = 0; index < value.length; index++) {
        let element = value[index];
        if (element === '[' || element === '{') {
          depth++;
        } else if (element === ']' || element === '}') {
          depth--;
        }

        if (element === ',' && depth === 0) {
          map.push (index);
        }
      }

      map.push (value.length);

      return map;
    }

    function parsePrimitive (value) {
      if (date (value)) {
        return new Date (value);
      }

      return eval (value);

      function date (value) {
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test (value);
      }
    }
  };

  let parseArrayOfTables = function (context, str) {
    let result = context.result;
    let current = result;
    let group = parseArrayName (str);
    let groups = parseSubGroups (group);
    addGroups (groups);

    function parseArrayName (str) {
      let start = str.indexOf ('['), end = str.indexOf (']');
      return str.substring (start + 2, end);
    }

    function parseSubGroups (str) {
      return str.split ('.');
    }

    function addGroup (group, last) {
      if (current[group]) {
        current = current[group];
      } else if (last) {
        current = current[group] = [];
        current.push ({});
        current = current[current.length - 1];
      } else {
        current = current[group] = {};
      }
      context.currentGroup = current;
    }

    function addGroups (groups) {
      for (let i = 0; i < groups.length; i++) {
        let last = i === groups.length - 1 ? true : false;
        addGroup (groups[i], last);
      }
    }
  };

  let parseLine = function (context, line) {
    if (group (line)) {
      parseGroup (context, line);
    } else if (expression (line)) {
      parseExpression (context, line);
    } else if (arrayOfTables (line)) {
      parseArrayOfTables (context, line);
    }

    function group (line) {
      return line.charAt (0) === '[' && line.charAt (1) !== '[';
    }

    function expression (line) {
      return line.indexOf ('=') > 0;
    }

    function arrayOfTables (line) {
      return line.charAt (0) === '[' && line.charAt (1) === '[';
    }
  };

  let parse = function (context, lines) {
    let i = 0;
    while (i < lines.length) {
      lines[i] = replaceWhitespaces (stripComments (lines[i]));
      if (lines[i].length === 0) {
        lines.splice (i, 1);
      } else {
        i++;
      }
    }
    mergeMultilines (lines).forEach (function (line) {
      parseLine (context, line);
    });

    function replaceWhitespaces (line) {
      return line.replace (/\s/g, '');
    }

    function stripComments (line) {
      return line.split ('#')[0];
    }

    function mergeMultilines (lines) {
      let merged = [], acc = [], capture = false, merge = false;
      lines.forEach (function (line) {
        if (multilineArrayStart (line)) {
          capture = true;
        }

        if (capture && multilineArrayEnd (line)) {
          merge = true;
        }

        if (capture) {
          acc.push (line);
        } else {
          merged.push (line);
        }

        if (merge) {
          capture = false;
          merge = false;
          merged.push (acc.join (''));
          acc = [];
        }
      });

      return merged;

      function multilineArrayStart (line) {
        return line.indexOf ('[') !== -1 && line.indexOf (']') === -1;
      }

      function multilineArrayEnd (line) {
        return line.indexOf (']') !== -1;
      }
    }
  };

  let startParser = function (str) {
    let context = {};
    context.result = {};
    let lines = str.toString ().split ('\n');

    parse (context, lines);

    return context.result;
  };

  String.prototype.replaceAll = function (find, replace) {
    let str = this;
    return str.replace (new RegExp (find, 'g'), replace);
  };

  let escapeString = function (str) {
    return str
      .replaceAll ('\b', '\\b')
      .replaceAll ('\t', '\\t')
      .replaceAll ('\n', '\\n')
      .replaceAll ('\f', '\\f')
      .replaceAll ('\r', '\\r')
      .replaceAll ('"', '\\"');
  };

  let isSimpleType = function (value) {
    let type = typeof value;
    let strType = Object.prototype.toString.call (value);
    if (strType === '[object Array]') {
      return isSimpleType (value[0]);
    }
    return (
      type === 'string' ||
      type === 'number' ||
      type === 'boolean' ||
      strType === '[object Date]'
    );
  };

  let isArrayOfTables = function (value) {
    let strType = Object.prototype.toString.call (value);
    if (strType === '[object Array]') {
      return !isSimpleType (value[0]);
    } else {
      return false;
    }
  };

  let dumpObject = function (value, context, aot) {
    context = context || [];
    aot = aot || false;
    let type = Object.prototype.toString.call (value);
    if (type === '[object Date]') {
      return value.toISOString ();
    } else if (type === '[object Array]') {
      if (value.length === 0) {
        return [];
      } else if (isSimpleType (value[0])) {
        let bracket = '[';
        let integers = 0;
        for (let index = 0; index < value.length; ++index) {
          if (typeof value[index] === 'number') {
            if (Number.isInteger (value[index])) {
              integers += 1;
            }
          }
        }
        let all_int = integers === value.length;
        for (let index = 0; index < value.length; ++index) {
          bracket += dump (value[index], undefined, undefined, all_int) + ', ';
        }
        return bracket.substring (0, bracket.length - 2) + ']';
      }
    }

    let result = '', simleProps = '';
    let propertyName;

    for (propertyName in value) {
      if (isSimpleType (value[propertyName])) {
        simleProps += propertyName + ' = ' + dump (value[propertyName]) + '\n';
      }
    }

    if (simleProps) {
      if (context.length > 0) {
        if (aot) {
          let contextName = context.join ('.');
          result += '[[' + contextName + ']]\n';
        } else {
          let contextName = context.join ('.');
          result += '[' + contextName + ']\n';
        }
      }
      result += simleProps + '\n';
    }

    for (propertyName in value) {
      if (isArrayOfTables (value[propertyName])) {
        for (let index = 0; index < value[propertyName].length; ++index) {
          result += dump (
            value[propertyName][index],
            context.concat (propertyName),
            true
          );
        }
      } else if (!isSimpleType (value[propertyName])) {
        result += dump (value[propertyName], context.concat (propertyName));
      }
    }

    return result;
  };

  let dump = function (value, context, aot, all_int) {
    console.log(value);
    switch (typeof value) {
      case 'string':
        return '"' + escapeString (value) + '"';
      case 'number':
        if (all_int) {
          return '' + value;
        } else if (Number.isInteger (value)) {
          return '' + value + '.0';
        } else {
          return '' + value;
        }
      case 'boolean':
        return value ? 'true' : 'false';
      case 'object':
        return dumpObject (value, context, aot);
      case 'undefined':
        return '';
    }
  };

  return {
    parse: startParser,
    dump: dump,
  };
}) ();
