/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function (CATMAID) {
  /*
  -------------------------------------------------------------
  SETUP
  This section initializes the widget along with configuring
  the layout
  */

  'use strict';
  let FloodfillingWidget = function () {
    this.widgetID = this.registerInstance ();
    this.idPrefix = `floodfilling-widget${this.widgetID}-`;

    this.oTable = null;
    this.configJsons = {};

    this.skeletons = [];
  };

  FloodfillingWidget.prototype = Object.create (
    CATMAID.SkeletonSource.prototype
  );

  FloodfillingWidget.prototype.constructor = FloodfillingWidget;

  $.extend (FloodfillingWidget.prototype, new InstanceRegistry ());

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
        let tabs = CATMAID.DOM.addTabGroup (controls, this.widgetID, [
          'Server',
          'Model',
          'Volumes',
          'Validate',
          'Explore',
        ]);
        // Change content based on currently active tab
        controls.firstChild.onclick = this.refocus.bind (this);

        // Create a button to load files
        let loadConfigButton = CATMAID.DOM.createFileButton (
          'st-file-dialog-' + this.widgetID,
          true,
          function (evt) {
            self.loadServerConfig (evt.target.files);
          }
        );

        // file button for config files
        let uploadConfig = document.createElement ('input');
        uploadConfig.setAttribute ('type', 'button');
        uploadConfig.setAttribute ('id', 'upload-config');
        uploadConfig.setAttribute ('value', 'Upload Config JSON');
        uploadConfig.onclick = function () {
          loadConfigButton.click ();
        };

        // create Server tab
        CATMAID.DOM.appendToTab (tabs['Server'], [
          [uploadConfig],
          ['Save Config JSON', this.saveServerConfig.bind (this)],
        ]);

        // Create a button to load files
        let loadModelButton = CATMAID.DOM.createFileButton (
          'st-file-dialog-' + this.widgetID,
          true,
          function (evt) {
            self.loadModelConfig (evt.target.files);
          }
        );

        // file button for model files
        let uploadModel = document.createElement ('input');
        uploadModel.setAttribute ('type', 'button');
        uploadModel.setAttribute ('id', 'upload-model');
        uploadModel.setAttribute ('value', 'Upload Model TOML');
        uploadModel.onclick = function () {
          loadModelButton.click ();
        };

        // create Model tab
        CATMAID.DOM.appendToTab (tabs['Model'], [
          [uploadModel],
          ['Save Model TOML', this.saveModelConfig.bind (this)],
        ]);

        CATMAID.DOM.appendToTab (tabs['Volumes'], [
          ['Upload Volume TOML', this.saveVolumes.bind (this)],
          ['Load Stack Volume', this.getVolume.bind (this)],
          ['Save Volume TOML', this.saveVolumes.bind (this)],
        ]);

        // create validation tab
        CATMAID.DOM.appendToTab (tabs['Validate'], [
          [document.createTextNode ('From')],
          [CATMAID.skeletonListSources.createSelect (this)],
          ['Append', this.loadSource.bind (this)],
          ['Clear', this.clear.bind (this)],
          ['Run', this.run.bind (this)],
        ]);

        // create explore tab
        CATMAID.DOM.appendToTab (tabs['Explore'], [
          [document.createTextNode ('From')],
          [CATMAID.skeletonListSources.createSelect (this)],
          ['Append', this.loadSource.bind (this)],
          ['Clear', this.clear.bind (this)],
          ['Run', this.run.bind (this)],
        ]);
        $ (controls).tabs ();
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
      init: this.init.bind (this),
    };
  };

  /**
   * initialize the widget
   */
  FloodfillingWidget.prototype.init = function () {
    const self = this;
    const tableID = this.idPrefix + 'datatable';
    const $table = $ ('#' + tableID);

    this.oTable = $table.DataTable ({
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
          className: 'skeletonID',
        },
        {
          data: 'skeletonSize',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: 'skeletonSize',
        },
      ],
    });

    $ (`#${tableID} tbody`).on ('click', 'tr', function () {
      if ($ (this).hasClass ('selected')) {
        $ (this).removeClass ('selected');
      } else {
        self.oTable.$ ('tr.selected').removeClass ('selected');
        $ (this).addClass ('selected');
      }
    });

    const exactNumSearch = function (event) {
      if (event.which == 13) {
        event.stopPropagation ();
        event.preventDefault ();
        // Filter with a regular expression
        const filterValue = event.currentTarget.value;
        const regex = filterValue === '' ? '' : `^${filterValue}$`;

        self.oTable
          .column (event.currentTarget.closest ('th'))
          .search (regex, true, false)
          .draw ();
      }
    };

    $ (`#${self.idPrefix}search-skeleton-id`).keydown (exactNumSearch);
    $ (`#${self.idPrefix}search-skeleton-size`).keydown (exactNumSearch);

    const $headerInput = $table.find ('thead input');

    // prevent sorting the column when focusing on the search field
    $headerInput.click (function (event) {
      event.stopPropagation ();
    });

    // remove the 'Search' string when first focusing the search box
    $headerInput.focus (function () {
      if (this.className === 'search_init') {
        this.className = '';
        this.value = '';
      }
    });

    this.refocus ();
  };

  FloodfillingWidget.prototype.append = function (models) {
    let skids = Object.keys (models);
    this.appendOrdered (skids, models);
  };

  FloodfillingWidget.prototype.appendOrdered = function (skids, models) {
    CATMAID.NeuronNameService.getInstance ().registerAll (
      this,
      models,
      function () {
        fetchSkeletons (
          skids,
          function (skid) {
            return CATMAID.makeURL (
              project.id + '/skeletons/' + skid + '/compact-detail'
            );
          },
          function (skid) {
            return {};
          },
          this.appendOne.bind (this),
          function (skid) {
            CATMAID.msg ('ERROR', 'Failed to load skeleton #' + skid);
          },
          this.update.bind (this),
          'GET'
        );
      }.bind (this)
    );
  };

  FloodfillingWidget.prototype.appendOne = function (skid, json) {
    var arborParser = new CATMAID.ArborParser ();

    // this object will calculate treenode depth
    var arbor = arborParser.init ('compact-skeleton', json).arbor;
    let row = {
      skeletonID: skid,
      skeletonSize: json[0].length,
      data: json,
      vertices: json[0].reduce ((vs, vertex) => {
        vs[vertex[0]] = new THREE.Vector3 (...vertex.slice (3, 6));
        return vs;
      }, {}),
      arbor: arbor,
    };
    this.oTable.rows.add ([row]);
  };

  FloodfillingWidget.prototype.clear = function () {
    this.oTable.clear ();
    this.oTable.draw ();
  };

  FloodfillingWidget.prototype.update = function () {
    this.oTable.draw ();
  };

  FloodfillingWidget.prototype.run = function () {
    this.downloadSkeletonTree ();
    return;

    let tileLayers = project.focusedStackViewer.getLayersOfType (
      CATMAID.TileLayer
    );
    for (let l = 0; l < tileLayers.length; ++l) {
      let tileLayer = tileLayers[l];
      // Only show visible tile layers
      if (!tileLayer.visible) {
        continue;
      }
      let tileSource = tileLayer.stack.createTileSourceForMirror (
        tileLayer.mirrorIndex
      );
      let img = document.createElement ('img');
      img.onload = function () {
        let canvas = document.createElement ('canvas');
        canvas.setAttribute ('height', img.width);
        canvas.setAttribute ('width', img.height);
        let ctx = canvas.getContext ('2d');
        ctx.drawImage (img, 0, 0);
        $ ('#content-wrapper').append (canvas);
      };
      //img.setAttribute("src", tileSource.getTileURL(project.id, tileLayer.stack,[0],0,0,0));
      img.setAttribute (
        'src',
        'https://neurocean.janelia.org/ssd-tiles-no-cache/0111-8/115/0/18_13.jpg'
      );
    }
  };

  FloodfillingWidget.prototype.downloadSkeletonTree = function (
    smooth_skeleton_sigma,
    resampling_delta
  ) {
    resampling_delta = resampling_delta || 1000;
    smooth_skeleton_sigma = smooth_skeleton_sigma || resampling_delta / 4;
    let arbor = this.oTable.row ('.selected').data ()['arbor'];
    let vs = this.oTable.row ('.selected').data ()['vertices'];
    let downsampled_skeleton = arbor.resampleSlabs (
      vs,
      smooth_skeleton_sigma,
      resampling_delta
    );
    console.log (downsampled_skeleton);
    // console.log (this.checkDistances (vs, downsampled_skeleton));

    let csv = 'start: ';
    for (
      let i = 0;
      i < Object.keys (downsampled_skeleton.positions).length;
      i++
    ) {
      csv +=
        i +
        ', ' +
        (downsampled_skeleton.arbor.edges[i] === downsampled_skeleton.arbor.root
          ? 'none'
          : downsampled_skeleton.arbor.edges[i]) +
        ', ' +
        downsampled_skeleton.positions[i].z +
        ', ' +
        downsampled_skeleton.positions[i].y +
        ', ' +
        downsampled_skeleton.positions[i].x +
        '\n';
    }

    console.log (csv);

    let data = encodeURI (csv);

    let link = document.createElement ('a');
    link.setAttribute ('href', data);
    link.setAttribute ('download', 'skeleton.csv');
    link.click ();
  };

  FloodfillingWidget.prototype.checkDistances = function (vs, downsampled) {
    let min_distances = [];
    for (let i in downsampled.positions) {
      let min_dist = Infinity;
      for (let j in vs) {
        min_dist = Math.min (
          min_dist,
          downsampled.positions[i].distanceTo (vs[j])
        );
      }
      min_distances.push (min_dist);
    }
    console.log (min_distances.reduce ((a, b) => Math.max (a, b)));
    console.log (min_distances.reduce ((a, b) => a + b) / min_distances.length);
    return min_distances;
  };

  FloodfillingWidget.prototype.destroy = function () {
    this.unregisterInstance ();
    this.unregisterSource ();
  };

  FloodfillingWidget.prototype.refocus = function () {
    let content = document.getElementById ('content-wrapper');
    let views = {
      Model: 'model',
      Server: 'config',
      Validate: 'table',
      Explore: 'table',
    };
    let mode = $ ('ul.ui-tabs-nav').children ('.ui-state-active').text ();
    for (let child of content.childNodes) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        child.className === views[mode]
      ) {
        child.style.display = 'block';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        child.style.display = 'none';
      }
    }
  };

  /*
  -------------------------------------------------------------
  MODEL
  This section contains everything necessary for the front end
  to send jobs to a server
  */

  /**
   * Load in a model file
   */
  FloodfillingWidget.prototype.loadModelConfig = function (file) {
    this.parseToml (file, 'model');
  };

  /**
   * Save the current list of skeletons including their colors to a file.
   */
  FloodfillingWidget.prototype.saveModelConfig = function () {
    let today = new Date ();
    let defaultFileName =
      'catmaid-model-' +
      today.getFullYear () +
      '-' +
      (today.getMonth () + 1) +
      '-' +
      today.getDate () +
      '.json';
    let filename = prompt ('File name', defaultFileName);
    if (!filename) return;

    let data = {
      server: 'example.int.janelia.org',
      username: 'person',
      password: 'passw0rd',
    };

    saveAs (
      new Blob ([JSON.stringify (data, null, ' ')], {type: 'text/plain'}),
      filename
    );
  };

  /*
  -------------------------------------------------------------
  SERVER
  This section contains everything necessary for the front end
  to send jobs to a server
  */

  /**
   * Load in a config file
   */
  FloodfillingWidget.prototype.loadServerConfig = function (file) {
    console.log ('TODO: loadConfig');
  };

  /**
   * Save the current list of skeletons including their colors to a file.
   */
  FloodfillingWidget.prototype.saveServerConfig = function () {
    let today = new Date ();
    let defaultFileName =
      'catmaid-config-' +
      today.getFullYear () +
      '-' +
      (today.getMonth () + 1) +
      '-' +
      today.getDate () +
      '.json';
    let filename = prompt ('File name', defaultFileName);
    if (!filename) return;

    let data = {
      server: 'example.int.janelia.org',
      username: 'person',
      password: 'passw0rd',
    };

    saveAs (
      new Blob ([JSON.stringify (data, null, ' ')], {type: 'text/plain'}),
      filename
    );
  };

  /*
  -------------------------------------------------------------
  VOLUMES
  This section deals with the volume toml
  */

  /**
   * Gather the information for the volume toml
   */
  FloodfillingWidget.prototype.getVolume = function () {
    let tileLayers = project.focusedStackViewer.getLayersOfType (
      CATMAID.TileLayer
    );
    this.configJsons.volumes = {ImageStack: [], HDF5: []};
    for (let l = 0; l < tileLayers.length; ++l) {
      let tileLayer = tileLayers[l];
      let stackInfo = Object.assign (
        {},
        tileLayer.stack.mirrors[tileLayer.mirrorIndex]
      );
      delete stackInfo.id;
      delete stackInfo.position;
      stackInfo['resolution'] = [
        tileLayer.stack.resolution.x,
        tileLayer.stack.resolution.y,
        tileLayer.stack.resolution.z,
      ];
      stackInfo['dimensions'] = [
        tileLayer.stack.dimension.x,
        tileLayer.stack.dimension.y,
        tileLayer.stack.dimension.z,
      ];
      stackInfo['broken_slices'] = tileLayer.stack.broken_slices;
      this.configJsons.volumes['ImageStack'].push (stackInfo);
    }
    console.log (toml.dump (this.configJsons.volumes));
  };

  /**
   * Save the current list of skeletons including their colors to a file.
   */
  FloodfillingWidget.prototype.saveVolumes = function () {
    let defaultFileName = 'volumes.toml';
    let filename = prompt ('File name', defaultFileName);
    if (!filename) return;
    if (!('volumes' in this.configJsons)) this.getVolume ();
    let data = toml.dump (this.configJsons.volumes);
    saveAs (new Blob ([data], {type: 'text/plain'}), filename);
  };

  /*
  ---------------------------------------
  TOML PARSER
  */

  FloodfillingWidget.prototype.downloadTomls = function () {
    console.log ('download tomls');
    this.saveVolumes ();
    this.saveServerConfig ();
    this.saveModelConfig ();
  };

  FloodfillingWidget.prototype.parseToml = function (file, content) {
    let reader = new FileReader ();
    let self = this;
    reader.onload = function (e) {
      self.configJsons[content] = toml.parse (reader.result);
      console.log (toml.dump (self.configJsons[content]));
      self.updateJsons ();
    };
    reader.readAsText (file[0]);
  };

  FloodfillingWidget.prototype.updateJsons = function () {
    let model = this.configJsons.model;
    let server = this.configJsons.server;
    if (model) {
      this.updateModelForm (model);
    }
    if (server) {
      this.updateServerForm (server);
    }
  };

  FloodfillingWidget.prototype.updateModelForm = function (model) {
    let form = document.getElementById ('model-form');
    form.classList.add ('selected-setting');
    let keys = Object.keys (model);
    for (let i = 0; i < keys.length; i++) {
      addElement (form, keys[i], model[keys[i]]);
    }

    function createSubContainer (container, key) {
      let subContainer = document.createElement ('div');
      subContainer.style.borderColor = 'red';
      subContainer.style.borderStyle = 'solid';
      subContainer.style.padding = '3px';
      subContainer.style.margin = '3px';

      subContainer.setAttribute ('class', 'model-form-box');
      if (container.classList.contains ('selected-setting')) {
        subContainer.classList.add ('seen-setting');
      } else {
        subContainer.classList.add ('hidden-setting');
        subContainer.style.display = 'none';
      }

      subContainer.onclick = function (e) {
        if ($ (this).hasClass ('selected-setting')) {
          $ (
            'div.seen-setting,' +
              'div.selected-setting,' +
              'label.seen-setting,' +
              'label.selected-setting',
            this
          )
            .removeClass ('seen-setting')
            .removeClass ('selected-setting')
            .addClass ('hidden-setting')
            .css ('display', 'none');
          $ (this).removeClass ('selected-setting');
          $ (this).addClass ('seen-setting');
          console.log (this.firstElementChild.innerHTML + ' deselect');
          e.stopPropagation ();
        } else {
          $ (this)
            .children ()
            .removeClass ('hidden-setting')
            .addClass ('seen-setting')
            .css ('display', 'block');
          $ (this).removeClass ('seen-setting');
          $ (this).addClass ('selected-setting');
          console.log (this.firstElementChild.innerHTML + ' selected');
          e.stopPropagation ();
        }
      };
      let title = document.createElement ('p');
      title.innerHTML = key;
      subContainer.append (title);
      return subContainer;
    }

    function createField (container, key, item) {
      let fieldLabel;
      if ((typeof item === 'string') | (typeof item === 'number')) {
        fieldLabel = document.createElement ('label');
        fieldLabel.append (document.createTextNode (key + ': '));
        let field = document.createElement ('input');
        field.setAttribute ('type', 'text');
        field.setAttribute ('value', item);
        fieldLabel.append (field);
        if (container.classList.contains ('selected-setting')) {
          fieldLabel.setAttribute ('class', 'seen-setting');
          fieldLabel.style.display = 'block';
        } else {
          fieldLabel.setAttribute ('class', 'hidden-setting');
          fieldLabel.style.display = 'none';
        }
      }
      return fieldLabel;
    }

    function addElement (container, key, item) {
      if (typeof item === 'object' && !Array.isArray (item)) {
        let subContainer = createSubContainer (container, key);
        let subKeys = Object.keys (item);
        for (let j = 0; j < subKeys.length; j++) {
          addElement (subContainer, subKeys[j], item[subKeys[j]]);
        }
        container.append (subContainer);
      } else {
        let field = createField (container, key, item);
        if (field) {
          container.append (field);
        }
      }
    }
  };

  /*
  -------------------------------------------------------------
  ADMIN
  This section just registers the widget
  */

  CATMAID.FloodfillingWidget = FloodfillingWidget;

  CATMAID.registerWidget ({
    name: 'floodfilling Widget',
    description: 'Widget associated with the floodfilling app',
    key: 'floodfilling-widget',
    creator: FloodfillingWidget,
  });
}) (CATMAID);
