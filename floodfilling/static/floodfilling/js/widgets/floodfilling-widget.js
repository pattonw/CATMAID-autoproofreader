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
    this.settings = {};

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
          'Settings',
          'Validate',
          'Explore',
        ]);
        // Change content based on currently active tab
        controls.firstChild.onclick = this.refocus.bind (this);

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
          <div class="settings" id="settings">
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

    this.initSettings ();

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
    let arborParser = new CATMAID.ArborParser ();

    // this object will calculate treenode depth
    let arbor = arborParser.init ('compact-skeleton', json).arbor;
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
    console.log (this.settings);
    return;
    this.downloadSkeletonTree (1000);
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
    resampling_delta,
    smooth_skeleton_sigma
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

    let csv = '';
    for (
      let i = 0;
      i < Object.keys (downsampled_skeleton.positions).length;
      i++
    ) {
      csv +=
        i +
        ',' +
        (i === downsampled_skeleton.arbor.root
          ? 'none'
          : downsampled_skeleton.arbor.edges[i]) +
        ',' +
        (downsampled_skeleton.positions[i].z / 50 - 121) +
        ',' +
        downsampled_skeleton.positions[i].y / 3.8 +
        ',' +
        downsampled_skeleton.positions[i].x / 3.8 +
        '\n';
    }

    /*    
    let skeleton = this.oTable.row ('.selected').data ()['data'][0];
    console.log (skeleton);
    // console.log (this.checkDistances (vs, downsampled_skeleton));

    let csv = '';
    for (let i = 0; i < skeleton.length; i++) {
      csv +=
        skeleton[i][0] +
        ',' +
        skeleton[i][1] +
        ',' +
        (skeleton[i][5] / 50 - 121) +
        ',' +
        skeleton[i][4] / 3.8 +
        ',' +
        skeleton[i][3] / 3.8 +
        '\n';
    }
    */

    console.log (csv);
    return;

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
      Settings: 'settings',
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
  SETTINGS
  This section contains the settings
  */

  FloodfillingWidget.prototype.createDefaultSettings = function () {
    /**
     * Adds necessary information for a new setting into the
     * default settings variable. This will later be used
     * to populate the settings page automatically.
     * @param {*} args
     */
    let addSettingTemplate = function (args) {
      let fields = {
        type: args.type,
        name: args.name,
        helptext: args.helptext,
        value: args.value,
        min: args.min,
        max: args.max,
        step: args.step,
        options: args.options,
        change: getChangeFunc (args.type, args.settings, args.label),
      };
      args.settings[args.label] = fields;
    };

    let getChangeFunc = function (type, settings, label) {
      if (type === 'numeric_spinner_float') {
        return function () {
          let newValue = parseFloat (this.value);
          settings[label].value = newValue;
        };
      } else if (type === 'numeric_spinner_int') {
        return function () {
          let newValue = parseFloat (this.value, 10);
          settings[label].value = newValue;
        };
      } else if (type === 'option_dropdown') {
        return function () {
          let newValue = this.value;
          settings[label].value = newValue;
        };
      } else if (type === 'checkbox') {
        return function () {
          let newValue = this.checked;
          settings[label].value = newValue;
        };
      } else if (type === 'integer_list') {
        return function () {
          let newValue = this.value
            .split (',')
            .map (CATMAID.tools.trimString)
            .map (Number);
          settings[label].value = newValue;
        };
      } else if (type === 'string') {
        return function () {
          let newValue = this.value;
          settings[label].value = newValue;
        };
      }
    };

    let getSubSettings = function (settings, setting) {
      settings[setting] = {};
      return settings[setting];
    };

    let createServerDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'server');
    };

    let createDiluvianVolumeDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'volume');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'integer_list',
        label: 'resolution',
        name: 'Resolution',
        value: [1, 1, 1],
        helptext: 'A list of numbers, representing the resolution of the input ' +
          'for the flood filling network. Note current downsampling images ' +
          'algorithm only supports downsampling resolution by powers of two',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'label_downsampling',
        name: 'Label downsampling',
        helptext: 'Method for downsampling label masks.',
        options: [
          {name: 'majority', id: 'majority'},
          {name: 'conjunction', id: 'conjunction'},
        ],
        value: 'majority',
      });
    };

    let createDiluvianModelDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'model');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'integer_list',
        label: 'input_fov_shape',
        name: 'Input FoV shape',
        value: [17, 33, 33],
        helptext: 'A list of numbers, representing the input field of view shape.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'integer_list',
        label: 'output_fov_shape',
        name: 'Output FoV shape',
        value: [17, 33, 33],
        helptext: 'A list of numbers, representing the output field of view shape.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'output_fov_move_fraction',
        name: 'Output FoV move fraction',
        value: 4,
        helptext: 'Move size as a fraction of the output field of view shape.',
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_float',
        label: 'v_true',
        name: 'Target True',
        value: 0.95,
        helptext: 'Soft target value for in-object mask voxels.',
        min: 0,
        max: 1,
        step: 0.001,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_float',
        label: 'v_false',
        name: 'Target False',
        value: 0.05,
        helptext: 'Soft target value for out-of-object mask voxels.',
        min: 0,
        max: 1,
        step: 0.001,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_float',
        label: 't_move',
        name: 'Target move',
        value: 0.9,
        helptext: 'Threshold mask probability in the move check plane ' +
          'to queue a move to that position.',
        min: 0,
        max: 1,
        step: 0.001,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_float',
        label: 't_final',
        name: 'Target final',
        value: 0.9,
        helptext: 'Threshold mask probability to produce the final ' +
          'segmentation. Defaults to ``t_move``',
        min: 0,
        max: 1,
        step: 0.001,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'move_check_thickness',
        name: 'Move check plane thickness',
        value: 1,
        helptext: 'Thickness of move check plane in voxels. Setting ' +
          'this greater than 1 is useful to make moves more robust even ' +
          'if the move grid aligns with missing sections or image artifacts.',
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'move_priority',
        name: 'Move priority',
        options: [
          {name: 'descending', id: 'descending'},
          {name: 'proximity', id: 'proximity'},
          {name: 'random', id: 'random'},
        ],
        helptext: "How to prioritize the move queue. Either 'descending' " +
          'to order by descending mask probability in the move check plane ' +
          "(default), 'proximity' to prioritize moves minimizing L1 path " +
          "distance from the seed, or 'random'.",
        value: 'descending',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'move_recheck',
        name: 'Move recheck',
        value: true,
        helptext: 'If true, when moves are retrieved from the queue a cube in the ' +
          'probability mask will be checked around the move location. If no ' +
          'voxels in this cube are greater than the move threshold, the move ' +
          'will be skipped. The cube size is one move step in each direction.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'integer_list',
        label: 'training_subv_shape',
        name: 'Training subvolume shape',
        value: [17, 33, 33],
        helptext: 'An optional list of numbers, representing the shape of the ' +
          'subvolumes used during training.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'integer_list',
        label: 'validation_subv_shape',
        name: 'Validation subvolume shape',
        value: [17, 33, 33],
        helptext: 'An optional list of numbers, representing the shape of the ' +
          'subvolumes used during training validation.',
      });
    };

    let createDiluvianNetworkDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'network');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'string',
        label: 'factory',
        name: 'Network Factory',
        value: 'diluvian.network.make_flood_fill_unet',
        helptext: 'Module and function name for a factory method for creating the ' +
          'flood filling network. This allows a custom architecture to be ' +
          'provided without needing to modify diluvian.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'transpose',
        name: 'Transpose',
        value: false,
        helptext: 'If true, any loaded networks will reverse the order of axes for ' +
          'both inputs and outputs. Data is assumed to be ZYX row-major, ' +
          'but old versions of diluvian used XYZ, so this is necessary' +
          'to load old networks.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'rescale_image',
        name: 'Rescale image',
        value: false,
        helptext: 'If true, rescale the input image intensity from [0, 1) to [-1, 1)',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'num_modules',
        name: 'Number of Modules',
        value: 8,
        helptext: 'Number of convolution modules to use, each module ' +
          'consisting of a skip link in parallel with ``num_layers_per_module`` ' +
          'convolution layers.',
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'num_layers_per_module',
        name: 'Number layers per module',
        value: 2,
        helptext: 'Number of layers to use in each organizational module, ' +
          'e.g., the number of convolution layers in each convolution module ' +
          'or the number of convolution layers before and after each down- ' +
          'and up-sampling respectively in a U-Net level.',
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'integer_list',
        label: 'convolution_dim',
        name: 'Convolution dimensions',
        helptext: 'Shape of the convolution for each layer.',
        value: [3, 3, 3],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'convolution_filters',
        name: 'Convolution filters',
        helptext: 'Number of convolution filters for each layer.',
        value: 32,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'convolution_activation',
        name: 'Convolution activation',
        helptext: 'Name of the Keras activation function to apply ' +
          'after convolution layers.',
        value: 'relu',
        options: [
          {name: 'Softmax', id: 'softmax'},
          {name: 'Exponential linear unit', id: 'elu'},
          {name: 'Scaled Exponential Linear Unit', id: 'selu'},
          {name: 'Softplus activation function', id: 'softplus'},
          {name: 'Softsign activation function', id: 'softsign'},
          {name: 'Rectified Linear Unit', id: 'relu'},
          {name: 'Hyperbolic tangent activation function', id: 'tanh'},
          {name: 'Sigmoid', id: 'sigmoid'},
          {name: 'Hard sigmoid', id: 'hard_sigmoid'},
          {name: 'Linear', id: 'linear'},
        ],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'convolution_padding',
        name: 'Convolution padding',
        helptext: 'Name of the padding mode for convolutions, either ' +
          "'same' (default) or 'valid'",
        value: 'same',
        options: [{name: 'Same', id: 'same'}, {name: 'Valid', id: 'valid'}],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'initialization',
        name: 'Weight initialization',
        helptext: 'Name of the Keras initialization function to use for weight ' +
          'initialization of all layers',
        value: 'glorot_uniform',
        options: [
          {name: 'Zeros', id: 'zeros'},
          {name: 'Ones', id: 'ones'},
          {name: 'Constant', id: 'constant'},
          {name: 'Random normal', id: 'random_normal'},
          {name: 'Random uniform', id: 'random_uniform'},
          {name: 'Truncated normal', id: 'truncated_normal'},
          {name: 'letiance scaling', id: 'letianceScaling'},
          {name: 'Orthogonal', id: 'orthogonal'},
          {name: 'Lecun normal', id: 'lecun_normal'},
          {name: 'Lecun uniform', id: 'lecun_uniform'},
          {name: 'Glorot normal', id: 'glorot_normal'},
          {name: 'Glorot uniform', id: 'glorot_uniform'},
          {name: 'He normal', id: 'he_normal'},
          {name: 'He uniform', id: 'he_uniform'},
          {name: 'Identity', id: 'identity'},
        ],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'output_activation',
        name: 'Output activation',
        helptext: 'Name of the Keras activation function to use ' +
          'for final network output.',
        value: 'sigmoid',
        options: [
          {name: 'Softmax', id: 'softmax'},
          {name: 'Exponential linear unit', id: 'elu'},
          {name: 'Scaled Exponential Linear Unit', id: 'selu'},
          {name: 'Softplus activation function', id: 'softplus'},
          {name: 'Softsign activation function', id: 'softsign'},
          {name: 'Rectified Linear Unit', id: 'relu'},
          {name: 'Hyperbolic tangent activation function', id: 'tanh'},
          {name: 'Sigmoid', id: 'sigmoid'},
          {name: 'Hard sigmoid', id: 'hard_sigmoid'},
          {name: 'Linear', id: 'linear'},
        ],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'dropout_probability',
        name: 'Dropout probability',
        helptext: 'Probability for dropout layers. If zero, no dropout ' +
          'layers will be included.',
        value: 0,
        min: 0,
        max: 1,
        step: 0.001,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'batch_normalization',
        name: 'Batch normalization',
        helptext: 'Whether to apply batch normalization. Note that in included networks ' +
          'normalization is applied after activation, rather than before ' +
          'as in the original paper, because this is now more common practice.',
        value: true,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'unet_depth',
        name: 'Unet depth',
        helptext: 'For U-Net models, the total number of downsampled ' +
          'levels in the network.',
        value: 4,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'integer_list',
        label: 'unet_downsample_rate',
        name: 'Unet downsample rate',
        helptext: 'The frequency in levels to downsample each axis. For example, ' +
          'a standard U-Net downsamples all axes at each level, so this ' +
          'value would be all ones. If data is anisotropic and Z should ' +
          'only be downsampled every other level, this value could be ' +
          '[2, 1, 1]. Axes set to 0 are never downsampled.',
        value: [1, 1, 1],
      });
    };

    let createDiluvianOptimizerDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'optimizer');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'klass',
        name: 'Optimizer',
        helptext: 'The optimization function to use.',
        value: 'sgd',
        options: [
          {name: 'Stochastic gradient descent', id: 'sgd'},
          {name: 'RMSProp', id: 'rmsprop'},
          {name: 'Adagrad', id: 'adagrad'},
          {name: 'Adadelta', id: 'adadelta'},
          {name: 'Adam', id: 'adam'},
          {name: 'Adamax', id: 'adamax'},
          {name: 'Nadam', id: 'nadam'},
        ],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'loss',
        name: 'Loss function',
        helptext: 'The loss function to use.',
        value: 'binary_crossentropy',
        options: [
          {name: 'Mean squared error', id: 'mse'},
          {name: 'Mean absolute error', id: 'mae'},
          {name: 'Mean absolute percentage error', id: 'mape'},
          {name: 'Mean squared logarithmic error', id: 'msle'},
          {name: 'Squared hinge', id: 'squared_hinge'},
          {name: 'Hinge', id: 'hinge'},
          {name: 'Categorical hinge', id: 'categorical_hinge'},
          {name: 'Log cosh', id: 'logcosh'},
          {name: 'Categorical crossentropy', id: 'categorical_crossentropy'},
          {
            name: 'Sparse categorical crossentropy',
            id: 'sparse_categorical_crossentropy',
          },
          {name: 'Binary crossentropy', id: 'binary_crossentropy'},
          {name: 'Kullback leibler divergence', id: 'kld'},
          {name: 'Poisson', id: 'poisson'},
          {name: 'Cosine proximity', id: 'cosine'},
        ],
      });
    };

    let createDiluvianTrainingDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'training');
    };

    let createDiluvianPostprocessingDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'postprocessing');
    };

    let createDiluvianDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'diluvian');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'seed',
        name: 'Seed',
        helptext: 'The seed to be used for all random number generators.',
        value: 1,
        min: 0,
        step: 1,
      });

      createDiluvianVolumeDefaults (sub_settings);
      createDiluvianModelDefaults (sub_settings);
      createDiluvianNetworkDefaults (sub_settings);
      createDiluvianOptimizerDefaults (sub_settings);
      createDiluvianTrainingDefaults (sub_settings);
      createDiluvianPostprocessingDefaults (sub_settings);
    };

    let createRunDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'run');
    };

    let createDefaults = function (settings) {
      // Add all settings
      createServerDefaults (settings);
      createDiluvianDefaults (settings);
      createRunDefaults (settings);
    }.bind (this);

    createDefaults (this.settings);
  };

  FloodfillingWidget.prototype.initSettings = function () {
    this.createDefaultSettings ();

    let createNumericInputSpinner = function (args) {
      let input = CATMAID.DOM.createInputSetting (
        args.name,
        args.value,
        args.helptext
      );

      $ (input).find ('input').spinner ({
        min: args.min,
        max: args.max,
        step: args.step,
        change: args.change,
        stop: args.change,
      });

      return input;
    };

    let createOptionDropdown = function (args) {
      let dropdown = $ ('<select/>');
      args.options.forEach (function (o) {
        this.append (new Option (o.name, o.id));
      }, dropdown);
      dropdown.val (args.value);

      dropdown.on ('change', args.change);

      return CATMAID.DOM.createLabeledControl (
        args.name,
        dropdown,
        args.helptext
      );
    };

    let createIntegerListInput = function (args) {
      return CATMAID.DOM.createInputSetting (
        args.name,
        args.value.join (', '),
        args.helptext,
        args.change
      );
    };

    let createStringInput = function (args) {
      return CATMAID.DOM.createInputSetting (
        args.name,
        args.value,
        args.helptext,
        args.change
      );
    };

    let createCheckbox = function (args) {
      return CATMAID.DOM.createCheckboxSetting (
        args.name,
        args.value,
        args.helptext,
        args.change
      );
    };

    let getInitialSetting = function (settings, title, value) {
      settings[title] = title in settings ? settings[title] : value;
      return settings[title];
    };

    let renderSetting = function (container, setting) {
      if (setting.type === 'option_dropdown') {
        container.append (createOptionDropdown (setting));
      } else if (setting.type === 'numeric_spinner_int') {
        container.append (createNumericInputSpinner (setting));
      } else if (setting.type === 'numeric_spinner_float') {
        container.append (createNumericInputSpinner (setting));
      } else if (setting.type === 'integer_list') {
        container.append (createIntegerListInput (setting));
      } else if (setting.type === 'string') {
        container.append (createStringInput (setting));
      } else if (setting.type === 'checkbox') {
        container.append (createCheckbox (setting));
      } else {
        CATMAID.msg ('warn', 'unknown setting type ' + setting.type);
      }
    };

    let createSection = function (container, setting, collapsed) {
      let section = CATMAID.DOM.addSettingsContainer (
        container,
        setting + ' settings',
        collapsed
      );
      let depth = section.parents ('div.settings-container').length;

      let button = $ ('<button class="uploadSettingsFile" />')
        .button ({
          icons: {
            primary: 'ui-icon-document',
          },
          text: false,
        })
        .click (function () {
          console.log ('clicked');
        });
      button.css ('position', 'absolute');
      button.css ('right', depth + 'em');
      button.css ('margin', '-1.6em 0 0 0');

      section.parent ().width ('100%');
      $ ('p:first', section.parent ()).after (button);

      return section;
    };

    let renderSettings = function (container, settings) {
      for (let setting in settings) {
        if (!('type' in settings[setting])) {
          let sub_settings = getInitialSetting (settings, setting, {});
          let ds = createSection (container, setting, true);
          renderSettings (ds, sub_settings);
        } else {
          renderSetting (container, settings[setting]);
        }
      }
    };

    let refresh = function (settings) {
      // get the settings page and clear it
      let space = $ ('#content-wrapper > #settings');
      space.width ('100%');
      space.css ('margin', '0em .5em .5em .5em');
      $ (space).empty ();

      // Add all settings
      renderSettings (space, this.settings);

      // Add collapsing support to all settings containers
      $ ('p.title', space).click (function () {
        let section = this;
        $ (section).next ().next ('.content').animate (
          {
            height: 'toggle',
            opacity: 'toggle',
          },
          {
            complete: function () {
              // change open/close indicator box
              let open_elements = $ ('.extend-box-open', section);
              if (open_elements.length > 0) {
                open_elements.attr ('class', 'extend-box-closed');
              } else {
                $ ('.extend-box-closed', section).attr (
                  'class',
                  'extend-box-open'
                );
              }
            },
          }
        );
      });
    }.bind (this);

    refresh (this.settings);
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
