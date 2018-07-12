/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function (CATMAID) {

  /*
  -------------------------------------------------------------
  SETUP
  This section initializes the widget along with configuring
  the layout
  */

  "use strict";

  var FloodfillingWidget = function () {
    this.widgetID = this.registerInstance();
    this.idPrefix = `floodfilling-widget${this.widgetID}-`;

    this.oTable = null;
    this.configJsons = {};

    this.skeletons = [];

  };

  FloodfillingWidget.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  FloodfillingWidget.prototype.constructor = FloodfillingWidget;

  $.extend(FloodfillingWidget.prototype, new InstanceRegistry());

  FloodfillingWidget.prototype.getName = function () {
    return 'Floodfilling Widget ' + this.widgetID;
  };

  FloodfillingWidget.prototype.getWidgetConfiguration = function () {
    const tableID = this.idPrefix + 'datatable';
    let self = this;
    return {
      helpText: 'Floodfilling Widget: ',
      controlsID: this.idPrefix + 'controls',
      createControls: function (controls) {

        // Create the tabs
        var tabs = CATMAID.DOM.addTabGroup(controls, this.widgetID, ['Server', 'Model', 'Volumes', 'Validate', 'Explore']);
        // Change content based on currently active tab
        controls.firstChild.onclick = this.refocus.bind(this);

        // Create a button to load files
        var loadConfigButton = CATMAID.DOM.createFileButton(
          'st-file-dialog-' + this.widgetID, true, function (evt) {
            self.loadConfig(evt.target.files);
          });

        // file button for config files
        var uploadConfig = document.createElement('input');
        uploadConfig.setAttribute("type", "button");
        uploadConfig.setAttribute("id", "upload-config");
        uploadConfig.setAttribute("value", "Upload Config JSON");
        uploadConfig.onclick = function () { loadConfigButton.click(); };

        // create Server tab
        CATMAID.DOM.appendToTab(tabs['Server'],
          [[uploadConfig],
          ['Save Config JSON', this.saveConfig.bind(this)],
          ]);

        // Create a button to load files
        var loadModelButton = CATMAID.DOM.createFileButton(
          'st-file-dialog-' + this.widgetID, true, function (evt) {
            self.loadModel(evt.target.files);
          });

        // file button for model files
        var uploadModel = document.createElement('input');
        uploadModel.setAttribute("type", "button");
        uploadModel.setAttribute("id", "upload-model");
        uploadModel.setAttribute("value", "Upload Model TOML");
        uploadModel.onclick = function () { loadModelButton.click(); };

        // create Model tab
        CATMAID.DOM.appendToTab(tabs['Model'],
          [[uploadModel],
          ['Save Model TOML', this.saveModel.bind(this)],
          ]);

        CATMAID.DOM.appendToTab(tabs['Volumes'],
          [['Upload Volume TOML', this.saveVolumes.bind(this)],
          ['Load Stack Volume', this.saveVolumes.bind(this)],
          ['Save Volume TOML', this.saveVolumes.bind(this)],
          ]);

        // create validation tab
        CATMAID.DOM.appendToTab(tabs['Validate'],
          [[document.createTextNode('From')],
          [CATMAID.skeletonListSources.createSelect(this)],
          ['Append', this.loadSource.bind(this)],
          ['Clear', this.clear.bind(this)],
          ['Run', this.run.bind(this)],
          ]);

        // create explore tab
        CATMAID.DOM.appendToTab(tabs['Explore'],
          [[document.createTextNode('From')],
          [CATMAID.skeletonListSources.createSelect(this)],
          ['Append', this.loadSource.bind(this)],
          ['Clear', this.clear.bind(this)],
          ['Run', this.run.bind(this)],
          ]);
        $(controls).tabs();
      },
      contentID: this.idPrefix + 'content',
      createContent: function (container) {
        container.innerHTML = `
        <div id="content-wrapper">
          <div class="table">
            <table cellpadding="0" cellspacing="0" border="0" class="display" id="${tableID}">
              <thead>
                <tr>
                  <th>Skeleton ID
                    <input type="number" name="searchSkeletonId" id="${this.idPrefix}search-skeleton-id"
                      value="0" class="search_init"/></th>
                  <th>Skeleton Size
                    <input type="number" name="searchSkeletonSize" id="${this.idPrefix}search-skeleton-size"
                      value="0" class="search_init"/>
                  </th>
                </tr>
              </thead>
              <tfoot>
                <tr>
                  <th>skeleton ID</th>
                  <th>skeleton Size</th>
                </tr>
              </tfoot>
              <tbody>
              </tbody>
            </table>
          </div>
          <div class="config">
            <p> Server Configuration: </p>
            <div id="config-form">
              <label for="address">Server Address</label>
              <input type="text" id="address" value="cardona-gpu1.int.janelia.org"><br>
              <label for="username">Username</label>
              <input type="text" id="username" value="example_person"><br>
              <label for="password">Password</label>
              <input type="text" id="password" value="p4ssw0rd"><br>
              <input type="submit" value="create">
            </div>
          </div>
          <div class="model">
            <p> Model Configuration: </p>
            <div id="model-form">
            </div>
          </div>
        </div>`;
      },
      init: this.init.bind(this)
    };
  };

  FloodfillingWidget.prototype.downloadTomls = function() {
    console.log("download tomls");
    this.saveVolumes();
  }
  /**
   * initialize the widget
   */
  FloodfillingWidget.prototype.init = function () {
    const self = this;
    const tableID = this.idPrefix + 'datatable';
    const $table = $('#' + tableID);

    this.oTable = $table.DataTable({
      // http://www.datatables.net/usage/options
      destroy: true,
      dom: '<"H"lrp>t<"F"ip>',
      serverSide: false,
      paging: true,
      lengthChange: true,
      autoWidth: false,
      pageLength: CATMAID.pageLengthOptions[0],
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      jQueryUI: true,
      processing: true,
      deferRender: true,
      columns: [
        {
          data: 'skeletonID',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: "skeletonID"
        },
        {
          data: 'skeletonSize',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: "skeletonSize"
        }
      ]
    });

    $(`#${tableID} tbody`).on('click', 'tr', function () {
      if ($(this).hasClass('selected')) {
        $(this).removeClass('selected');
      }
      else {
        self.oTable.$('tr.selected').removeClass('selected');
        $(this).addClass('selected');
      }
    });

    const exactNumSearch = function (event) {
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        // Filter with a regular expression
        const filterValue = event.currentTarget.value;
        const regex = filterValue === '' ? '' : `^${filterValue}$`;

        self.oTable
          .column(event.currentTarget.closest('th'))
          .search(regex, true, false)
          .draw();
      }
    };

    $(`#${self.idPrefix}search-skeleton-id`).keydown(exactNumSearch);
    $(`#${self.idPrefix}search-skeleton-size`).keydown(exactNumSearch);

    const $headerInput = $table.find('thead input');

    // prevent sorting the column when focusing on the search field
    $headerInput.click(function (event) {
      event.stopPropagation();
    });

    // remove the 'Search' string when first focusing the search box
    $headerInput.focus(function () {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });

    this.refocus();
  };

  FloodfillingWidget.prototype.append = function (models) {
    let skids = Object.keys(models);
    this.appendOrdered(skids, models);
  };

  FloodfillingWidget.prototype.appendOrdered = function (skids, models) {
    CATMAID.NeuronNameService.getInstance().registerAll(this, models, (function () {
      fetchSkeletons(
        skids,
        function (skid) { return CATMAID.makeURL(project.id + '/skeletons/' + skid + '/compact-detail'); },
        function (skid) { return {}; },
        this.appendOne.bind(this),
        function (skid) { CATMAID.msg("ERROR", "Failed to load skeleton #" + skid); },
        this.update.bind(this),
        "GET");
    }).bind(this));
  };

  FloodfillingWidget.prototype.appendOne = function (skid, json) {
    let row = { skeletonID: skid, skeletonSize: json[0].length, skeletonTree: json[0] };
    this.oTable.rows.add([row]);
  };


  FloodfillingWidget.prototype.clear = function () {
    this.oTable.clear();
    this.oTable.draw();
  };

  FloodfillingWidget.prototype.update = function () {
    this.oTable.draw();
  }

  FloodfillingWidget.prototype.run = function () {
    var tileLayers = project.focusedStackViewer.getLayersOfType(CATMAID.TileLayer);
    for (var l=0; l<tileLayers.length; ++l) {
      var tileLayer = tileLayers[l];
      // Only show visible tile layers
      if (!tileLayer.visible) {
        continue;
      }
      var tileSource = tileLayer.stack.createTileSourceForMirror(tileLayer.mirrorIndex);
      var img = document.createElement("img");
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.setAttribute('height', img.width);
        canvas.setAttribute('width', img.height);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0);
        $('#content-wrapper').append(canvas);
      };
      //img.setAttribute("src", tileSource.getTileURL(project.id, tileLayer.stack,[0],0,0,0));
      img.setAttribute("src", "https://neurocean.janelia.org/ssd-tiles-no-cache/0111-8/115/0/18_13.jpg");
    }
  }

  FloodfillingWidget.prototype.downloadSkeletonTree = function () {
    let skeletonData = this.oTable.row('.selected').data()['skeletonTree'];
    let lines = [];
    skeletonData.forEach(function (node, index) {
      let nid = node[0];
      let pnid = node[1];
      let x = node[3];
      let y = node[4];
      let z = node[5];
      let line = nid + ',' + pnid + ',' + x + ',' + y + ',' + z;
      lines.push(line);
    })
    let csv = lines.join('\n');

    if (!csv.match(/^data:text\/csv/i)) {
      csv = 'data:text/csv;charset=utf-8,' + csv;
    }
    let data = encodeURI(csv);

    let link = document.createElement('a');
    link.setAttribute('href', data);
    link.setAttribute('download', 'skeleton.csv');
    link.click();
  }

  FloodfillingWidget.prototype.destroy = function () {
    this.unregisterInstance();
    this.unregisterSource();
  };

  FloodfillingWidget.prototype.refocus = function () {
    let content = document.getElementById("content-wrapper");
    let views = {
      "Model": "model",
      "Server": "config",
      "Validate": "table",
      "Explore": "table"
    };
    let mode = $("ul.ui-tabs-nav").children(".ui-state-active").text();
    for (let child of content.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && child.className === views[mode]) {
        child.style.display = 'block';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        child.style.display = 'none';
      }
    }
  }



  /*
  -------------------------------------------------------------
  MODEL
  This section contains everything necessary for the front end
  to send jobs to a server
  */

  /**
   * Load in a model file
   */
  FloodfillingWidget.prototype.loadModel = function (file) {
    this.parseToml(file, 'model');
  };

  /**
   * Save the current list of skeletons including their colors to a file.
   */
  FloodfillingWidget.prototype.saveModel = function () {
    var today = new Date();
    var defaultFileName = 'catmaid-model-' + today.getFullYear() + '-' +
      (today.getMonth() + 1) + '-' + today.getDate() + '.json';
    var filename = prompt('File name', defaultFileName);
    if (!filename) return;

    var data = {
      'server': 'example.int.janelia.org',
      'username': 'person',
      'password': 'passw0rd'
    };

    saveAs(new Blob([JSON.stringify(data, null, ' ')], { type: 'text/plain' }), filename);
  };


  /*
  -------------------------------------------------------------
  CONFIG
  This section contains everything necessary for the front end
  to send jobs to a server
  */

  /**
   * Load in a config file
   */
  FloodfillingWidget.prototype.loadConfig = function (file) {
    console.log("TODO: loadConfig");
  };

  /**
   * Save the current list of skeletons including their colors to a file.
   */
  FloodfillingWidget.prototype.saveConfig = function () {
    var today = new Date();
    var defaultFileName = 'catmaid-config-' + today.getFullYear() + '-' +
      (today.getMonth() + 1) + '-' + today.getDate() + '.json';
    var filename = prompt('File name', defaultFileName);
    if (!filename) return;

    var data = {
      'server': 'example.int.janelia.org',
      'username': 'person',
      'password': 'passw0rd'
    };

    saveAs(new Blob([JSON.stringify(data, null, ' ')], { type: 'text/plain' }), filename);
  };


  /*
  -------------------------------------------------------------
  VOLUMES
  This section deals with the volume toml
  */

  /**
   * Gather the information for the volume toml
   */
  FloodfillingWidget.prototype.getVolumes = function () {
    var tileLayers = project.focusedStackViewer.getLayersOfType(CATMAID.TileLayer);
    this.configJsons.volumes = {'DataSet':[]};
    for (var l=0; l<tileLayers.length; ++l) {
      var tileLayer = tileLayers[l];
      this.configJsons.volumes['DataSet'].push(tileLayer.stack.mirrors[tileLayer.mirrorIndex]);
    }
    this.saveVolumes();
  }

  /**
   * Save the current list of skeletons including their colors to a file.
   */
  FloodfillingWidget.prototype.saveVolumes = function () {
    var defaultFileName = 'volumes.toml';
    var filename = prompt('File name', defaultFileName);
    if (!filename) return;
    if (!('volumes' in this.configJsons)) this.getVolumes();
    var data = toml.dump(this.configJsons.volumes);
    saveAs(new Blob([data], { type: 'text/plain' }), filename);
  };

  /*
  ---------------------------------------
  TOML PARSER
  */

  FloodfillingWidget.prototype.parseToml = function (file, content) {
    let reader = new FileReader();
    let self = this;
    reader.onload = function (e) {
      self.configJsons[content] = toml.parse(reader.result);
      console.log(toml.dump(self.configJsons[content]));
      self.updateJsons();
    }
    reader.readAsText(file[0]);

  }

  FloodfillingWidget.prototype.updateJsons = function(){
    let model = this.configJsons.model;
    let server = this.configJsons.server;
    if (model){
      this.updateModelForm(model);
    }
    if (server){
      this.updateServerForm(server);
    }
  }

  FloodfillingWidget.prototype.updateModelForm = function(model){
    let form = document.getElementById('model-form');
    form.classList.add("selected-setting")
    let keys = Object.keys(model);
    for (let i = 0; i < keys.length; i++){
      addElement(form, keys[i], model[keys[i]]);
    }
    
    function createSubContainer(container, key){
      let subContainer = document.createElement('div');
      subContainer.style.borderColor = "red";
      subContainer.style.borderStyle = "solid";
      subContainer.style.padding = "3px";
      subContainer.style.margin = "3px";

      subContainer.setAttribute("class", "model-form-box");
      if (container.classList.contains('selected-setting')){
        subContainer.classList.add('seen-setting');
      } else {
        subContainer.classList.add('hidden-setting');
        subContainer.style.display = "none"
      }

      subContainer.onclick = function(e){
        if ($(this).hasClass('selected-setting')) {
          $('div.seen-setting,'+
            'div.selected-setting,'+
            'label.seen-setting,'+
            'label.selected-setting', this)
            .removeClass('seen-setting')
            .removeClass('selected-setting')
            .addClass('hidden-setting')
            .css('display', 'none');
          $(this).removeClass('selected-setting');
          $(this).addClass('seen-setting');
          console.log(this.firstElementChild.innerHTML + " deselect");
          e.stopPropagation();
        } else {
          $(this).children().removeClass('hidden-setting')
            .addClass('seen-setting')
            .css('display', 'block');
          $(this).removeClass('seen-setting');
          $(this).addClass('selected-setting');
          console.log(this.firstElementChild.innerHTML + " selected");
          e.stopPropagation();
        }
      };
      let title = document.createElement('p');
      title.innerHTML = key;
      subContainer.append(title);
      return subContainer;
    }

    function createField(container, key, item){
      let fieldLabel;
      if (typeof(item) === 'string' | typeof(item) === 'number'){
        fieldLabel = document.createElement('label');
        fieldLabel.append(document.createTextNode(key + ": "));
        let field = document.createElement('input');
        field.setAttribute('type', 'text');
        field.setAttribute('value', item);
        fieldLabel.append(field);
        if (container.classList.contains("selected-setting")){
          fieldLabel.setAttribute('class','seen-setting');
          fieldLabel.style.display = 'block';
        } else {
          fieldLabel.setAttribute('class', 'hidden-setting');
          fieldLabel.style.display = 'none';
        }
      } 
      return fieldLabel
    }

    function addElement(container, key, item){
      if (typeof(item) === 'object' && !Array.isArray(item)){
        let subContainer = createSubContainer(container, key);
        let subKeys = Object.keys(item);
        for (let j = 0; j < subKeys.length; j++){
          addElement(subContainer, subKeys[j], item[subKeys[j]]);
        }
        container.append(subContainer);
      } else {
        let field = createField(container, key, item);
        if (field){
          container.append(field);
        }
      }
    }
  }

  /*
  -------------------------------------------------------------
  ADMIN
  This section just registers the widget
  */

  CATMAID.FloodfillingWidget = FloodfillingWidget;

  CATMAID.registerWidget({
    name: 'floodfilling Widget',
    description: 'Widget associated with the floodfilling app',
    key: 'floodfilling-widget',
    creator: FloodfillingWidget
  });

})(CATMAID);

/*
-----------------------------------------------------------------
TOML's
This section is code for reading and writing toml files
*/


var toml = (function () {

  var parseGroup = function (context, str) {
    var result = context.result;
    var current = result;
    var group = parseGroupName(str);
    var groups = parseSubGroups(group);
    addGroups(groups);

    function parseGroupName(str) {
      var start = str.indexOf('['), end = str.indexOf(']');
      return str.substring(start + 1, end);
    }

    function parseSubGroups(str) {
      return str.split('.');
    }

    function addGroup(group) {
      if (current[group]) {
        current = current[group];
      } else {
        current = current[group] = {};
      }
      context.currentGroup = current;
    }

    function addGroups(groups) {
      groups.forEach(function (current) {
        addGroup(current);
      });
    }
  };

  var parseExpression = function (context, line) {
    var pair = parseNameValueGroup(line);
    var value = parseValue(pair.value);
    var currentGroup = getCurrentGroup(context, pair.group);
    currentGroup[pair.name] = value;

    function getCurrentGroup(context, groups){
      let current = context.currentGroup || context.result;
      groups.forEach(function(group){
        if (current[group]){
          current = current[group];
        } else {
          current = current[group] = {};
        }
      });
      return current;
    }

    function parseNameValueGroup(line) {
      var equal = line.split('=');
      equal[0] = equal[0].split('.');
      temp = [];
      let seenMark = false;
      let start = 0;
      for (var index = 0; index < equal[0].length; ++index){
        if (!seenMark & equal[0][index].indexOf('"')>-1){
          seenMark = true;
          seen = index;
        } else if (seenMark & equal[0][index].indexOf('"')>0){
          seenMark = false;
          let comb = equal[0].slice(start, index + 1).join(".");
          temp.push(comb)
        } else if (!seenMark){
          temp.push(equal[0][index]);
        }
      }
      equal[0] = temp;

      return {
        group: equal[0].slice(0,equal[0].length - 1),
        name: equal[0][equal[0].length - 1],
        value: equal[1]
      };
    }

    function parseValue(value) {
      if (array(value)) {
        return parseArray(value);
      }

      return parsePrimitive(value);

      function array(value) {
        return value.charAt(0) === '[' && value.charAt(value.length - 1) === ']';
      }
    }

    function parseArray(value) {
      var values = parseArrayValues(value);
      return values.map(function (v) {
        return parseValue(v);
      });

      function parseArrayValues(value) {
        var parsed = [];
        var array = value.substring(1, value.length - 1);
        var map = commasMap(array);
        map.reduce(function (prev, next) {
          let entry = array.substring(prev + 1, next);
          if (entry){
            parsed.push(array.substring(prev + 1, next));
          }
          return next;
        }, -1);

        return parsed;

        function commasMap(value) {
          var map = [];
          var inArray = false, depth = 0;
          for (var index = 0; index < value.length; index++) {
            var element = value[index];
            if (element === '[') {
              depth++;
            } else if (element === ']') {
              depth--;
            }

            if (element === ',' && depth === 0) {
              map.push(index);
            }
          }

          map.push(value.length);

          return map;
        }
      }
    }

    function parsePrimitive(value) {
      if (date(value)) {
        return new Date(value);
      }

      return eval(value);

      function date(value) {
        return (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/).test(value);
      }
    }
  };

  var parseArrayOfTables = function (context, str) {
    var result = context.result;
    var current = result;
    var group = parseArrayName(str);
    var groups = parseSubGroups(group);
    addGroups(groups);

    function parseArrayName(str) {
      var start = str.indexOf('['), end = str.indexOf(']');
      return str.substring(start + 2, end);
    }

    function parseSubGroups(str) {
      return str.split('.');
    }

    function addGroup(group, last) {
      if (current[group]) {
        current = current[group];
      } else if (last) {
        current = current[group] = [];
        current.push({});
        current = current[current.length - 1];
      } else {
        current = current[group] = {};
      }
      context.currentGroup = current;
    }

    function addGroups(groups) {
      for (let i = 0; i < groups.length; i++){
        let last = i === groups.length - 1 ? true : false;
        addGroup(groups[i], last);
      }
    }
  }

  var parseLine = function (context, line) {
    if (group(line)) {
      parseGroup(context, line);
    } else if (expression(line)) {
      parseExpression(context, line);
    } else if (arrayOfTables(line)) {
      parseArrayOfTables(context, line);
    }

    function group(line) {
      return line.charAt(0) === '[' && line.charAt(1) !== '[';
    }

    function expression(line) {
      return line.indexOf('=') > 0;
    }

    function arrayOfTables(line) {
      return line.charAt(0) === '[' && line.charAt(1) === '[';
    }
  };

  var parse = function (context, lines) {
    let i = 0;
    while (i < lines.length){
      lines[i] = replaceWhitespaces(stripComments(lines[i]));
      if (lines[i].length === 0){
        lines.splice(i,1);
      } else {
        i++;
      }
    }
    mergeMultilines(lines).forEach(function (line) {
      parseLine(context, line);
    });

    function replaceWhitespaces(line) {
      return line.replace(/\s/g, '');
    }

    function stripComments(line) {
      return line.split('#')[0];
    }

    function mergeMultilines(lines) {
      var merged = [], acc = [], capture = false, merge = false;
      lines.forEach(function (line) {
        if (multilineArrayStart(line)) {
          capture = true;
        }

        if (capture && multilineArrayEnd(line)) {
          merge = true;
        }

        if (capture) {
          acc.push(line);
        } else {
          merged.push(line);
        }

        if (merge) {
          capture = false; merge = false;
          merged.push(acc.join(''));
          acc = [];
        }
      });

      return merged;

      function multilineArrayStart(line) {
        return line.indexOf('[') !== -1 && line.indexOf(']') === -1;
      }

      function multilineArrayEnd(line) {
        return line.indexOf(']') !== -1;
      }
    }
  };

  var startParser = function (str) {
    var context = {}; context.result = {};
    var lines = str.toString().split('\n');

    parse(context, lines);

    return context.result;
  };

  String.prototype.replaceAll = function (find, replace) {
    var str = this;
    return str.replace(new RegExp(find, 'g'), replace);
  };

  var escapeString = function (str) {
    return str
      .replaceAll('\b', '\\b')
      .replaceAll('\t', '\\t')
      .replaceAll('\n', '\\n')
      .replaceAll('\f', '\\f')
      .replaceAll('\r', '\\r')
      .replaceAll('\"', '\\"');
  };

  var isSimpleType = function (value) {
    var type = typeof value;
    var strType = Object.prototype.toString.call(value);
    if (strType === '[object Array]'){
      return isSimpleType(value[0]);
    }
    return type === 'string' || type === 'number' || type === 'boolean' || strType === '[object Date]';
  };

  var isArrayOfTables = function(value) {
    var strType = Object.prototype.toString.call(value);
    if (strType === '[object Array]'){
      return !isSimpleType(value[0]);
    } else {
      return false;
    }
  }

  var dumpObject = function (value, context, aot) {
    context = context || [];
    aot = aot || false;
    var type = Object.prototype.toString.call(value);
    if (type === '[object Date]') {
      return value.toISOString();
    } else if (type === '[object Array]') {
      if (value.length === 0) {
        return [];
      } else if (isSimpleType(value[0])){
        var bracket = '[';
        for (var index = 0; index < value.length; ++index) {
          bracket += dump(value[index]) + ', ';
        }
        return bracket.substring(0, bracket.length - 2) + ']';
      }
    }

    var result = '', simleProps = '';
    var propertyName;

    for (propertyName in value) {
      if (isSimpleType(value[propertyName])) {
        simleProps += propertyName + ' = ' + dump(value[propertyName]) + '\n';
      }
    }

    if (simleProps) {
      if (context.length > 0) {
        if (aot) {
          var contextName = context.join('.');
          result += '[[' + contextName + ']]\n';
        } else {
          var contextName = context.join('.');
          result += '[' + contextName + ']\n';
        }
      }
      result += simleProps + '\n';
    }

    for (propertyName in value) {
      if (isArrayOfTables(value[propertyName])){
        for (var index = 0; index < value[propertyName].length; ++index) {
          result += dump(value[propertyName][index], context.concat(propertyName), true);
        }
      }
      else if (!isSimpleType(value[propertyName])) {
        result += dump(value[propertyName], context.concat(propertyName));
      }
    }

    return result;
  };

  var dump = function (value, context, aot) {
    switch (typeof value) {
      case 'string':
        return '"' + escapeString(value) + '"';
      case 'number':
        return '' + value;
      case 'boolean':
        return value ? 'true' : 'false';
      case 'object':
        return dumpObject(value, context, aot);
    }
  };

  return {
    parse: startParser,
    dump: dump
  };

})();