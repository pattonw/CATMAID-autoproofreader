/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function (CATMAID) {
  /*
  --------------------------------------------------------------------------------
  SETUP
  */

  'use strict';
  let FloodfillingWidget = function () {
    this.widgetID = this.registerInstance ();
    this.idPrefix = `floodfilling-widget${this.widgetID}-`;

    this.oTable = null;
    this.configJsons = {};
    this.settings = {};
    this.volumes = {ImageStack: [], HDF5: []};

    this.supported_fields = [];
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
    const jobsTableID = this.idPrefix + 'datatable-jobs';
    const resultsTableID = this.idPrefix + 'datatable-results';
    let self = this;
    return {
      helpText: 'Floodfilling Widget: ',
      controlsID: this.idPrefix + 'controls',
      createControls: function (controls) {
        // Create the tabs
        let tabs = CATMAID.DOM.addTabGroup (controls, this.widgetID, [
          'Run',
          'Jobs',
          'Results',
          'Test',
        ]);
        // Change content based on currently active tab
        controls.firstChild.onclick = this.refocus.bind (this);

        var fileButton = CATMAID.DOM.createFileButton (
          undefined,
          false,
          function (evt) {
            self.uploadSettingsToml (evt.target.files, self.settings);
          }
        );

        // create validation tab
        CATMAID.DOM.appendToTab (tabs['Run'], [
          ['Floodfill', this.floodfill.bind (this)],
          [
            'Download Settings',
            function () {
              self.saveToml (
                self.getSettingValues (self.settings),
                'ff_widget_settings.toml'
              );
            },
          ],
          [
            'Upload Settings',
            function () {
              fileButton.click ();
            },
          ],
        ]);

        CATMAID.DOM.appendToTab (tabs['Test'], [
          ['test1', this.test1.bind (this)],
          ['test2', this.test2.bind (this)],
          ['test3', this.test3.bind (this)],
          ['test4', this.test4.bind (this)],
          ['test5', this.test5.bind (this)],
          ['testOpticalFlow', this.testOpticalFlow.bind (this)],
        ]);
        $ (controls).tabs ();
      },
      contentID: this.idPrefix + 'content',
      createContent: function (container) {
        container.innerHTML = `
        <div id="content-wrapper">
          <div class="jobs">
            <table cellpadding="0" cellspacing="0" border="0" class="display" id="${jobsTableID}">
              <thead>
                <tr>
                  <th>Submission Date
                    <input type="date" name="submissionDate" id="${this.idPrefix}search-submission-dat"
                    class="search_init"/>
                  </th>
                  <th>Skeleton ID
                    <input type="number" name="searchSkeletonId" id="${this.idPrefix}search-skeleton-id"
                      value="0" class="search_init"/>
                  </th>
                </tr>
              </thead>
              <tfoot>
                <tr>
                  <th>submission Date</th>
                  <th>skeleton ID</th>
                </tr>
              </tfoot>
              <tbody>
              </tbody>
            </table>
          </div>
          <div class="results">
            <table cellpadding="0" cellspacing="0" border="0" class="display" id="${resultsTableID}">
              <thead>
                <tr>
                  <th>Skeleton ID
                    <input type="number" name="searchSkeletonId" id="${this.idPrefix}search-skeleton-id"
                      value="0" class="search_init"/></th>
                  <th>Nodes Filled (percent)
                  </th>
                </tr>
              </thead>
              <tfoot>
                <tr>
                  <th>skeleton ID</th>
                  <th>nodes filled</th>
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
    this.initTables ();

    this.initSettings ();

    this.refocus ();
  };

  /**
   * Change the widget layout to show the appropriate content per tab.
   */
  FloodfillingWidget.prototype.refocus = function () {
    let content = document.getElementById ('content-wrapper');
    let views = {
      Run: 'settings',
      Jobs: 'jobs',
      Results: 'results',
      Test: 'none',
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
  --------------------------------------------------------------------------------
  RUNNING
  */

  FloodfillingWidget.prototype.floodfill = function () {
    let self = this;
    this.gatherFiles ().then (function (files) {
      self.sendJob (files);
    });
  };

  FloodfillingWidget.prototype.gatherFiles = function () {
    let self = this;
    let setting_values = self.getSettingValues ();
    return this.getSkeleton (setting_values.run).then (function (skeleton_csv) {
      return {
        skeleton: skeleton_csv,
        volume: toml.dump (self.getVolumes ()),
        server: JSON.stringify (setting_values.server),
        diluvian: toml.dump (setting_values['diluvian']),
      };
    });
  };

  FloodfillingWidget.prototype.sendJob = function (files) {
    let add_file = function (container, data, file_name) {
      let file = new File (
        [
          new Blob ([data], {
            type: 'text/plain',
          }),
        ],
        file_name
      );
      container.append (file.name, file, file.name);
    };
    var post_data = new FormData ();
    add_file (post_data, files.diluvian, 'config.toml');
    add_file (post_data, files.volume, 'volume.toml');
    add_file (post_data, files.skeleton, 'skeleton.csv');
    add_file (post_data, files.server, 'server.json');

    CATMAID.fetch (
      'ext/floodfilling/' + project.id + '/flood-fill',
      'POST',
      post_data,
      undefined,
      undefined,
      undefined,
      undefined,
      {'Content-type': null}
    )
      .then (function (e) {
        console.log (e);
      })
      .catch (function (error) {
        CATMAID.handleError (error);
      });
  };

  /*
  --------------------------------------------------------------------------------
  TESTING
  */

  FloodfillingWidget.prototype.test1 = function () {
    this.getSkeleton ().then (function (result) {
      console.log (result);
    });
  };

  FloodfillingWidget.prototype.test2 = function () {
    let self = this;
    let params = {
      name: 'cardona-gpu1 - diluvian',
      address: 'cardona-gpu1.int.janelia.org',
    };
    CATMAID.fetch (
      'ext/floodfilling/' + project.id + '/add-compute-server',
      'POST',
      params
    ).then (function (e) {
      console.log (e);
      self.refreshServers ();
    });
  };

  FloodfillingWidget.prototype.test3 = function () {
    CATMAID.fetch (
      'ext/floodfilling/' + project.id + '/compute-servers',
      'GET'
    ).then (function (e) {
      console.log (e);
    });
  };

  FloodfillingWidget.prototype.test4 = function () {
    let self = this;
    CATMAID.fetch (
      'ext/floodfilling/' + project.id + '/compute-servers',
      'GET'
    ).then (function (e) {
      e.forEach (function (server) {
        CATMAID.fetch (
          'ext/floodfilling/' +
            project.id +
            '/remove-compute-server/' +
            server.id,
          'DELETE'
        ).then (function (e) {
          console.log (e);
        });
      });
      self.refreshServers ();
    });
  };

  FloodfillingWidget.prototype.test5 = function () {
    console.log (this.settings);
  };

  FloodfillingWidget.prototype.testOpticalFlow = function () {
    let tileLayers = project.focusedStackViewer.getLayersOfType (
      CATMAID.TileLayer
    );
    let i = 0;
    let tileLayer = tileLayers[i];
    // Only get a visible tile layers
    while (!tileLayer.visible) {
      if (i > tileLayers.length) {
        throw 'no visible layers';
      }
      i = i + 1;
      tileLayer = tileLayers[i];
    }

    let tileSource = tileLayer.stack.createTileSourceForMirror (
      tileLayer.mirrorIndex
    );

    CATMAID.fetch (
      project.id + '/skeletons/' + 18277211 + '/compact-detail'
    ).then (function (skeleton) {
      let nodes = skeleton[0];
      let nodes100 = nodes.slice (100, 200);

      Promise.all (
        nodes100.map (node => optic_flow (nodes, node))
      ).then (function (moves) {
        let move_metrics = moves.map (function (result) {
          if (result) {
            let theta_a = Math.atan2 (result[0][0], result[0][1]);
            let mag_a = Math.sqrt (
              Math.pow (result[0][0], 2) + Math.pow (result[0][1], 2)
            );
            let theta_b = Math.atan2 (result[1][0], result[1][1]);
            let mag_b = Math.sqrt (
              Math.pow (result[1][0], 2) + Math.pow (result[1][1], 2)
            );
            return [
              Math.min (theta_b - theta_a, 2 * Math.PI - (theta_b - theta_a)),
              Math.abs ((mag_b - mag_a) / mag_b),
            ];
          }
        });
        let totals = move_metrics.reduce (
          function (acc, cur) {
            if (typeof cur !== 'undefined') {
              acc[0] = acc[0] + Math.abs (cur[0]);
              acc[1] = acc[1] + Math.abs (cur[1]);
            }
            return acc;
          },
          [0, 0]
        );
        console.log (move_metrics);
        console.log (totals);
      });
    });

    let optic_flow = function (nodes, current) {
      let moves = [];
      moves.push (current.slice ());
      if (current[5] < get_node (nodes, current[1])[5]) {
        let next_frame = current.slice ();
        next_frame[5] = next_frame[5] + tileLayer.stack.resolution.z;
        moves.push (next_frame);
      } else if (current[5] > get_node (nodes, current[1])[5]) {
        let next_frame = current.slice ();
        next_frame[5] = next_frame[5] - tileLayer.stack.resolution.z;
        moves.push (next_frame);
      }

      if (moves.length > 1) {
        return Promise.all (
          moves.map (node => get_node_data (node))
        ).then (function (canvases) {
          let data = [];
          for (let canvas of canvases) {
            data.push (get_data (canvas));
          }
          let move = get_move (data, nodes, current);
          plot_change (canvases, [move[2], move[3]]);
          return [move[0], move[1]];
        });
      }
    };

    let plot_change = function (canvases, node_moves) {
      let ctx0 = canvases[0].getContext ('2d');
      let ctx1 = canvases[1].getContext ('2d');
      for (let i = 0; i < node_moves[1].length / 2; i++) {
        ctx0.beginPath ();
        ctx0.arc (
          node_moves[0][i * 2],
          node_moves[0][i * 2 + 1],
          3,
          0,
          2 * Math.PI
        );
        ctx0.fillStyle = 'red';
        ctx0.fill ();
        ctx1.beginPath ();
        ctx1.arc (
          node_moves[1][i * 2],
          node_moves[1][i * 2 + 1],
          3,
          0,
          2 * Math.PI
        );
        ctx1.fillStyle = 'red';
        ctx1.fill ();
      }
    };

    let get_move = function (data, nodes, node) {
      if (data.length === 2) {
        let parent = get_node (nodes, node[1]);
        let expected_change = [parent[3] - node[3], parent[4] - node[4]];

        let levels = 3,
          start_width = 256,
          start_height = 256,
          data_type = jsfeat.U8_t | jsfeat.C1_t;
        let prev_pyr = new jsfeat.pyramid_t (levels);

        // this will populate data property with matrix_t instances
        prev_pyr.allocate (start_width, start_height, data_type);
        prev_pyr.build (data[0]);

        let curr_pyr = new jsfeat.pyramid_t (levels);

        // this will populate data property with matrix_t instances
        curr_pyr.allocate (start_width, start_height, data_type);
        curr_pyr.build (data[1]);

        let prev_xy = new Float32Array (100 * 2),
          curr_xy = new Float32Array (100 * 2),
          count = 0,
          win_size = 10,
          max_iter = 30,
          status = new Uint8Array (100),
          eps = 0.01,
          min_eigen_threshold = 0.0001;

        for (let i = 0; i < 5; i++) {
          for (let j = 0; j < 5; j++) {
            count = add_point (
              prev_xy,
              128 + 10 * (i - 2),
              128 + 10 * (j - 2),
              count
            );
          }
        }

        jsfeat.optical_flow_lk.track (
          prev_pyr,
          curr_pyr,
          prev_xy,
          curr_xy,
          count,
          win_size,
          max_iter,
          status,
          eps,
          min_eigen_threshold
        );

        let total_change = [0, 0];
        for (let i = 0; i < count; i++) {
          let a_x = prev_xy[2 * i], a_y = prev_xy[2 * i + 1];
          let b_x = curr_xy[2 * i], b_y = curr_xy[2 * i + 1];
          total_change[0] = total_change[0] + b_x - a_x;
          total_change[1] = total_change[1] + b_y - a_y;
        }
        let change = total_change.map (total => total / count);
        return [
          expected_change,
          change,
          prev_xy.slice (0, count * 2),
          curr_xy.slice (0, count * 2),
        ];
      }
    };

    let add_point = function (xy, x, y, count) {
      xy[count << 1] = x;
      xy[(count << 1) + 1] = y;
      return count + 1;
    };

    let get_node = function (nodes, id) {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i][0] === id) {
          return nodes[i];
        }
      }
    };

    let get_node_data = function (node) {
      let z_coord =
        (node[5] - tileLayer.stack.translation.z) /
        tileLayer.stack.resolution.z;
      let y_coord = [
        (node[4] - tileLayer.stack.translation.y) /
          tileLayer.stack.resolution.y,
      ];
      let x_coord = [
        (node[3] - tileLayer.stack.translation.x) /
          tileLayer.stack.resolution.x,
      ];

      let center_x =
        x_coord[0] -
        Math.floor (x_coord[0] / tileSource.tileWidth) * tileSource.tileWidth;
      let center_y =
        y_coord[0] -
        Math.floor (y_coord[0] / tileSource.tileHeight) * tileSource.tileHeight;

      if (center_x < 128) {
        x_coord.push (x_coord[0] - 512);
      } else if (512 - center_x < 128) {
        x_coord.push (x_coord[0] + 512);
      }
      if (center_y < 128) {
        y_coord.push (y_coord[0] - 512);
      } else if (512 - center_y < 128) {
        y_coord.push (y_coord[0] + 512);
      }

      let canvas = document.createElement ('canvas');
      canvas.setAttribute ('height', 256);
      canvas.setAttribute ('width', 256);

      let promises = [];
      for (let i = 0; i < x_coord.length; i++) {
        for (let j = 0; j < y_coord.length; j++) {
          promises.push (
            new Promise (resolve => {
              let img = document.createElement ('img');
              img.crossOrigin = 'Anonymous';
              img.setAttribute (
                'src',
                tileSource.getTileURL (
                  project.id,
                  tileLayer.stack,
                  [z_coord],
                  Math.floor (x_coord[i] / tileSource.tileWidth),
                  Math.floor (y_coord[j] / tileSource.tileHeight),
                  0
                )
              );
              img.onload = function () {
                let ctx = canvas.getContext ('2d');
                ctx.drawImage (
                  img,
                  x_coord[i] -
                    x_coord[0] -
                    (x_coord[0] -
                      Math.floor (x_coord[0] / tileSource.tileWidth) *
                        tileSource.tileWidth) +
                    128,
                  y_coord[j] -
                    y_coord[0] -
                    (y_coord[0] -
                      Math.floor (y_coord[0] / tileSource.tileHeight) *
                        tileSource.tileHeight) +
                    128
                );
                resolve ();
              };
            })
          );
        }
      }
      return new Promise (function (resolve) {
        Promise.all (promises).then (function (e) {
          resolve (canvas, node);
        });
      });
    };

    let get_data = function (canvas) {
      $ ('#content-wrapper').append (canvas);
      let ctx = canvas.getContext ('2d');
      let width = 256;
      let height = 256;
      var image_data = ctx.getImageData (0, 0, width, height);

      var gray_img = new jsfeat.matrix_t (
        width,
        height,
        jsfeat.U8_t | jsfeat.C1_t
      );
      var code = jsfeat.COLOR_RGBA2GRAY;
      jsfeat.imgproc.grayscale (image_data.data, width, height, gray_img, code);
      return gray_img;
    };
  };

  /*
  --------------------------------------------------------------------------------
  SKELETONS
  */

  let getVertices = function (nodes) {
    return nodes.reduce ((vs, vertex) => {
      vs[vertex[0]] = new THREE.Vector3 (...vertex.slice (3, 6));
      return vs;
    }, {});
  };

  FloodfillingWidget.prototype.getSkeleton = function () {
    let self = this;
    let run_settings = self.getSettingValues (self.settings).run;
    let skid = run_settings['skeleton_id'];
    return CATMAID.fetch (project.id + '/skeletons/' + skid + '/compact-detail')
      .then (function (skeleton_json) {
        let arborParser = new CATMAID.ArborParser ();
        let arbor = arborParser.init ('compact-skeleton', skeleton_json).arbor;
        let nodes = getVertices (skeleton_json[0]);
        if (run_settings['filter_by_strahler']) {
          let strahler = arbor.strahlerAnalysis ();
          if (
            !Object.values (strahler).filter (
              index => index >= run_settings.strahler_filter
            ).length > 0
          ) {
            CATMAID.msg (
              'warn',
              'The chosen strahler index filter excludes all nodes'
            );
            throw 'strahler index too high. Max strahler index in this skeleton is: (' +
              Object.values (strahler).reduce ((a, b) => Math.max (a, b)) +
              ')';
          }
          [arbor.edges, nodes] = [
            Object.keys (arbor.edges)
              .filter (id => strahler[id] >= run_settings.strahler_filter)
              .reduce (function (a, b) {
                a[b] = arbor.edges[b];
                return a;
              }, {}),
            Object.keys (nodes)
              .filter (id => strahler[id] >= run_settings.strahler_filter)
              .reduce (function (a, b) {
                a[b] = nodes[b];
                return a;
              }, {}),
          ];
        }
        if (run_settings['resample']) {
          [arbor, nodes] = self.sampleSkeleton (
            arbor,
            nodes,
            run_settings.resampling_delta,
            run_settings.smoothing_sigma
          );
        }
        return self.skeletonToCSV (arbor, nodes);
      })
      .catch (function (error) {
        CATMAID.handleError (error);
      });
  };

  FloodfillingWidget.prototype.sampleSkeleton = function (
    arbor,
    nodes,
    resampling_delta,
    smoothing_sigma
  ) {
    resampling_delta = resampling_delta || 1000;
    smoothing_sigma = smoothing_sigma || resampling_delta / 4;
    let downsampled_skeleton = arbor.resampleSlabs (
      nodes,
      smoothing_sigma,
      resampling_delta
    );
    return [downsampled_skeleton.arbor, downsampled_skeleton.positions];
  };

  FloodfillingWidget.prototype.skeletonToCSV = function (arbor, nodes) {
    let csv = '';
    for (let i = 0; i < Object.keys (nodes).length; i++) {
      csv +=
        i +
        ',' +
        (typeof arbor.edges[i] === 'undefined' ? i : arbor.edges[i]) +
        ',' +
        nodes[i].z +
        ',' +
        nodes[i].y +
        ',' +
        nodes[i].x +
        '\n';
    }
    return csv;
  };

  /*
  --------------------------------------------------------------------------------
  VOLUMES
  This section deals with the volume toml
  */

  FloodfillingWidget.prototype.addCurrentImageStackVolumes = function () {
    let tileLayers = project.focusedStackViewer.getLayersOfType (
      CATMAID.TileLayer
    );
    let volumes = this.volumes;
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
      stackInfo['translation'] = [
        tileLayer.stack.translation.x,
        tileLayer.stack.translation.y,
        tileLayer.stack.translation.z,
      ];
      stackInfo['broken_slices'] = tileLayer.stack.broken_slices;
      volumes['ImageStack'].push (stackInfo);
    }
  };

  /**
   * Gather the information for the volume toml
   */
  FloodfillingWidget.prototype.getVolumes = function () {
    if (
      this.volumes['ImageStack'].length === 0 &&
      this.volumes['HDF5'].length === 0
    ) {
      this.addCurrentImageStackVolumes ();
    }
    return this.volumes;
  };

  /**
   * Save the volume data in a toml
   */
  FloodfillingWidget.prototype.saveVolumes = function () {
    if (!('volumes' in this.configJsons)) this.getVolumes ();
    this.saveToml (this.getVolumes (), 'volumes');
  };

  /*
  --------------------------------------------------------------------------------
  SERVER
  */

  FloodfillingWidget.prototype.getServer = function () {
    let server = this.getSettingValues (this.settings.server);
    console.log (server);
    return server;
  };

  FloodfillingWidget.prototype.refreshServers = function () {
    let self = this;
    CATMAID.fetch (
      'ext/floodfilling/' + project.id + '/compute-servers',
      'GET'
    ).then (function (e) {
      let options = [];
      e.forEach (function (server) {
        options.push ({name: server.name, id: server.id});
      });
      self.settings.server.id.options = options;
      self.settings.server.id.value = options.length > 0
        ? options[0].id
        : undefined;
      self.refreshSettings (self.settings.server);
    });
  };

  /*
  --------------------------------------------------------------------------------
  TOML PARSER
  */

  /**
   * Save an object as a toml file
   */
  FloodfillingWidget.prototype.saveToml = function (object, name) {
    let filename = name + '.toml';
    if (!filename) return;
    let data = toml.dump (object);
    saveAs (new Blob ([data], {type: 'text/plain'}), filename);
  };

  FloodfillingWidget.prototype.uploadSettingsToml = function (files, settings) {
    let self = this;
    if (!CATMAID.containsSingleValidFile (files, 'toml')) {
      return;
    }

    let reader = new FileReader ();
    reader.onload = function (e) {
      let uploaded_settings = toml.parse (reader.result);

      /**
       * This function assumes any setting found in new settings is already
       * a field in old settings. Thus it just overwrites the values in 
       * old_settings with the values from new settings
       * @param {*} old_settings 
       * @param {*} new_settings 
       */
      let update_settings = function (old_settings, new_settings) {
        Object.keys (new_settings).forEach (function (key) {
          // first check if the key is in the old_settings
          if (key in old_settings) {
            // if the key is part of the old settings, check if it
            // is a field that can have its value overwritten
            if ('type' in old_settings[key]) {
              old_settings[key]['value'] = new_settings[key];
            } else {
              // key must be an overarching catagory that contains fields.
              // Thus fill in each of its fields or sub-catagories.
              update_settings (old_settings[key], new_settings[key]);
            }
          } else {
            CATMAID.msg (
              'warn',
              'The settings field ' +
                key +
                ' has not yet been properly implemented'
            );
          }
        });
      };
      update_settings (settings, uploaded_settings);
      self.refreshSettings (settings);
    };
    reader.readAsText (files[0]);
  };

  /*
  --------------------------------------------------------------------------------
  TABLE
  */
  FloodfillingWidget.prototype.initTables = function () {
    this.initJobsTable ();
    this.initResultsTable ();
  };

  FloodfillingWidget.prototype.initJobsTable = function () {
    const self = this;
    const tableID = this.idPrefix + 'datatable-jobs';
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
          data: 'submissionDate',
          render: function (data) {
            DataDay = data.dayOfMonth;
            DataObj = data.dayOfMonth + '/' + data.monthValue + '/' + data.year;
            Return (dataDay < 10) ? '0' + dataObj : dataObj;
          },
          orderable: true,
          searchable: true,
          className: 'submissionDate',
        },
        {
          data: 'skeletonID',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: 'skeletonID',
        },
      ],
    });

    $ (`#${tableID} tbody`).on ('click', 'tr', function () {
      $ (this).toggleClass ('selected');
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
  };

  FloodfillingWidget.prototype.initResultsTable = function () {
    const self = this;
    const tableID = this.idPrefix + 'datatable-results';
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
          data: 'nodesFilled',
          orderable: true,
          searchable: true,
          className: 'skeletonSize',
        },
      ],
    });

    $ (`#${tableID} tbody`).on ('click', 'tr', function () {
      $ (this).toggleClass ('selected');
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

    let row = {
      skeletonID: skid,
      skeletonSize: json[0].length,
      data: json,
      vertices: json[0].reduce ((vs, vertex) => {
        vs[vertex[0]] = new THREE.Vector3 (...vertex.slice (3, 6));
        return vs;
      }, {}),
      arbor: arborParser.init ('compact-skeleton', json).arbor,
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

  /*
  --------------------------------------------------------------------------------
  SETTINGS
  This section contains the settings
  */

  FloodfillingWidget.prototype.initSettings = function () {
    this.createDefaultSettings ();

    this.createSettings ();
  };

  FloodfillingWidget.prototype.refreshSettings = function (settings) {
    // TODO: change the refresh function to only change the values of each setting
    // This will allow for values to be set more naturally without closing
    // all settings tabs. Also probably quite a bit faster
    refreshSetting (settings);

    function refreshSetting (setting) {
      if ('change' in setting) {
        setting.change ();
      } else {
        let keys = Object.keys (setting);
        for (let key of keys) {
          refreshSetting (setting[key]);
        }
      }
    }
  };

  FloodfillingWidget.prototype.createSettings = function () {
    let self = this;

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

    let createNumberListInput = function (args) {
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

    let renderSetting = function (container, setting) {
      let newOption;
      if (setting.type === 'option_dropdown') {
        newOption = createOptionDropdown (setting);
      } else if (setting.type === 'numeric_spinner_int') {
        newOption = createNumericInputSpinner (setting);
      } else if (setting.type === 'numeric_spinner_float') {
        newOption = createNumericInputSpinner (setting);
      } else if (setting.type === 'number_list') {
        newOption = createNumberListInput (setting);
      } else if (setting.type === 'string') {
        newOption = createStringInput (setting);
      } else if (setting.type === 'checkbox') {
        newOption = createCheckbox (setting);
      } else {
        CATMAID.msg ('warn', 'unknown setting type ' + setting.type);
      }
      container.append (newOption);
    };

    let createSection = function (container, key, values, collapsed) {
      let section = CATMAID.DOM.addSettingsContainer (
        container,
        key + ' settings',
        collapsed
      );
      section.id = key;
      let depth = section.parents ('div.settings-container').length;

      var fileButton = CATMAID.DOM.createFileButton (
        undefined,
        false,
        function (evt) {
          self.uploadSettingsToml (evt.target.files, values);
        }
      );

      let uploadbutton = $ ('<button class="uploadSettingsFile" />')
        .button ({
          icons: {
            primary: 'ui-icon-arrowthick-1-n',
          },
          text: false,
        })
        .click (function () {
          fileButton.click ();
        });
      uploadbutton.css ('position', 'absolute');
      uploadbutton.css ('right', depth + 'em');
      uploadbutton.css ('margin', '-1.6em 0 0 0');

      let downloadbutton = $ ('<button class="downloadSettingsFile" />')
        .button ({
          icons: {
            primary: 'ui-icon-arrowthick-1-s',
          },
          text: false,
        })
        .click (function () {
          self.saveToml (self.getSettingValues (values), key);
        });
      downloadbutton.css ('position', 'absolute');
      downloadbutton.css ('right', depth + 3 + 'em');
      downloadbutton.css ('margin', '-1.6em 0 0 0');

      section.parent ().width ('100%');
      $ ('p:first', section.parent ()).after (uploadbutton);
      section.parent ().width ('100%');
      $ ('p:first', section.parent ()).after (downloadbutton);

      return section;
    };

    let renderSettings = function (container, settings) {
      for (let setting in settings) {
        if (!('type' in settings[setting])) {
          let ds = createSection (container, setting, settings[setting], true);
          renderSettings (ds, settings[setting]);
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
        $ (section).next ().next ().next ('.content').animate (
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

  FloodfillingWidget.prototype.getSettingValues = function (
    settings,
    setting_values
  ) {
    setting_values = setting_values || {};
    settings = settings || this.settings;
    let keys = Object.keys (settings);
    if (keys.length > 0) {
      for (let key of keys) {
        if (key) {
          if ('type' in settings[key]) {
            if (
              this.supported_fields.includes (settings[key]['type']) &&
              'value' in settings[key]
            ) {
              setting_values[key] = settings[key]['value'];
            }
          } else if (Object.keys (settings[key]).length > 0) {
            setting_values[key] = this.getSettingValues (
              settings[key],
              setting_values[key]
            );
          }
        }
      }
    }
    return setting_values;
  };

  FloodfillingWidget.prototype.createDefaultSettings = function () {
    /**
   * Adds necessary information for a new setting into the
   * default settings variable. This will later be used
   * to populate the settings page automatically.
   * @param {*} args
   */

    let self = this;

    let addSettingTemplate = function (args) {
      let fields = {
        type: args.type,
        name: args.name,
        label: args.label,
        helptext: args.helptext,
        value: args.value,
        min: args.min,
        max: args.max,
        step: args.step,
        options: args.options,
        get_choices: args.get_choices,
        mode: args.mode,
        change: getChangeFunc (args.type, args.settings, args.label),
      };
      args.settings[args.label] = fields;
    };

    let getChangeFunc = function (type, settings, label) {
      if (type === 'numeric_spinner_float') {
        self.supported_fields.push ('numeric_spinner_float');
        return function () {
          let newValue = parseFloat (this.value);
          settings[label].value = newValue;
        };
      } else if (type === 'numeric_spinner_int') {
        self.supported_fields.push ('numeric_spinner_int');
        return function () {
          let newValue = parseFloat (this.value, 10);
          settings[label].value = newValue;
        };
      } else if (type === 'option_dropdown') {
        self.supported_fields.push ('option_dropdown');
        return function () {
          let newValue = this.value;
          settings[label].value = newValue;
        };
      } else if (type === 'checkbox') {
        self.supported_fields.push ('checkbox');
        return function () {
          let newValue = this.checked;
          settings[label].value = newValue;
        };
      } else if (type === 'number_list') {
        self.supported_fields.push ('number_list');
        return function () {
          let newValue = this.value
            .split (',')
            .map (CATMAID.tools.trimString)
            .map (Number);
          settings[label].value = newValue;
        };
      } else if (type === 'string') {
        self.supported_fields.push ('string');
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

    /**
     * Everything to do with connecting the widget to the
     * compute server goes here.
     * @param {*} settings 
     */
    let createServerDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'server');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'id',
        name: 'Compute server',
        options: [],
        helptext: 'The compute server to use for floodfilling',
        value: undefined,
      });

      self.refreshServers ();

      addSettingTemplate ({
        settings: sub_settings,
        type: 'string',
        label: 'diluvian_path',
        name: 'Diluvian path',
        value: 'diluvian',
        helptext: 'The path to the diluvian directory on the compute server',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'string',
        label: 'env_source',
        name: 'Virtual Environment Source',
        value: '.virtualenv/diluvian/bin/activate',
        helptext: 'The path to activate your desired virtual environment',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'string',
        label: 'results_dir',
        name: 'Results directory',
        value: 'results',
        helptext: 'A directory in diluvian to store floodfilling job results',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'string',
        label: 'model_file',
        name: 'Trained model',
        value: 'diluvian_trained.hpf5',
        helptext: 'The path to the trained model to be used',
      });
    };

    let createDiluvianVolumeDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'volume');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
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

    /**
     * These are the settings related to diluvian and its 
     * execution
     * @param {*} settings 
     */
    let createDiluvianModelDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'model');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'input_fov_shape',
        name: 'Input FoV shape',
        value: [17, 33, 33],
        helptext: 'A list of numbers, representing the input field of view shape.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
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
        type: 'number_list',
        label: 'training_subv_shape',
        name: 'Training subvolume shape',
        value: [17, 33, 33],
        helptext: 'An optional list of numbers, representing the shape of the ' +
          'subvolumes used during training.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
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
        type: 'number_list',
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
        type: 'number_list',
        label: 'unet_downsample_rate',
        name: 'Unet downsample rate',
        helptext: 'The frequency in levels to downsample each axis. For example, ' +
          'a standard U-Net downsamples all axes at each level, so this ' +
          'value would be all ones. If data is anisotropic and Z should ' +
          'only be downsampled every other level, this value could be ' +
          '[2, 1, 1]. Axes set to 0 are never downsampled.',
        value: [1, 1, 1],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'unet_downsample_mode',
        name: 'Downsample mode',
        helptext: 'The mode used for downsampling. "Fixed rate" will use the ' +
          'rate specified in "Unet downsample rate", "As needed" will attempt ' +
          'to downsample in a way that will maximize the isotropic properties ' +
          'of the volume by downsampling high resolution axes first.',
        value: 'as_needed',
        options: [
          {name: 'As needed', id: 'as_needed'},
          {name: 'Fixed rate', id: 'fixed_rate'},
        ],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'resolution',
        name: 'Volume resolution',
        helptext: 'This field is necessary for the "as_needed" Downsample mode. ' +
          'This should be the same as the resolution described in the volume settings.',
        value: self.settings.diluvian.volume.resolution.value,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'coord_layer',
        name: 'Coordinate channels',
        helptext: 'Whether to include coordinate channels in the input as described ' +
          'in "An Intriguing Failing of Convolutional Neural Networks and the ' +
          'CoordConv Solution" (https://arxiv.org/abs/1807.03247)',
        value: false,
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

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'num_gpus',
        name: 'Number of GPUs',
        helptext: 'Number of GPUs to use for data-parallelism.',
        value: 1,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'num_workers',
        name: 'Number of workers',
        helptext: 'Number of worker queues to use for generating training data.',
        value: 4,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'gpu_batch_size',
        name: 'GPU batch size',
        helptext: 'Per-GPU batch size. The effective batch size will be ' +
          'this times ``num_gpus``.',
        value: 8,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'training_size',
        name: 'Training sample size',
        helptext: 'Number of samples to use for training **from each volume**.',
        value: 256,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'validation_size',
        name: 'Validation sample size',
        helptext: 'Number of samples to use for validation **from each volume**.',
        value: 256,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'total_epochs',
        name: 'Total epochs',
        helptext: 'Maximum number of training epochs.',
        value: 100,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'reset_generators',
        name: 'Reset generators',
        helptext: 'Reset training generators after each epoch, so that the training ' +
          'examples at each epoch are identical.',
        value: false,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'fill_factor_bins',
        name: 'Fill factor bins',
        helptext: 'Bin boundaries for filling fractions. If provided, sample loss ' +
          'will be weighted to increase loss contribution from less-frequent bins.',
        value: undefined,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'dict',
        label: 'partitions',
        name: 'Partitions',
        helptext: 'TODO\nDictionary mapping volume name regexes to a sequence of int ' +
          'indicating number of volume partitions along each axis. Only one axis should ' +
          'be greater than 1. Each volume should match at most 1 regex.',
        value: {'".*"': [2, 1, 1]},
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'dict',
        label: 'training_partition',
        name: 'Training partitions',
        helptext: 'TODO\nDictionary mapping volume name regexes to a sequence of int ' +
          'indicating number of volume partitions along each axis. Only one axis should ' +
          'be greater than 1. Each volume should match at most 1 regex.',
        value: {'".*"': [0, 0, 0]},
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'dict',
        label: 'validation_partition',
        name: 'Validation partitions',
        helptext: 'TODO\nDictionary mapping volume name regexes to a sequence of int ' +
          'indicating number of volume partitions along each axis. Only one axis should ' +
          'be greater than 1. Each volume should match at most 1 regex.',
        value: {'".*"': [1, 0, 0]},
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'dict',
        label: 'validation_metric',
        name: 'Validation metric',
        helptext: 'TODO\nModule and function name for a metric function taking a true and ' +
          "predicted region mask ('metric'). Boolean of whether to threshold the mask " +
          "for the metric (true) or use the mask and target probabilities ('threshold').\n" +
          "String 'min' or 'max'for how to choose best validation metric value ('mode').",
        value: {
          metric: 'diluvian.util.binary_f_score',
          threshold: true,
          mode: 'max',
          args: {beta: 0.5},
        },
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'patience',
        name: 'Patience',
        helptext: 'Number of epochs after the last minimal validation loss to terminate training.',
        value: 10,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'early_abort_epoch',
        name: 'Early abort epoch',
        helptext: 'If provided, training will check at the end of this epoch whether validation ' +
          'loss is less than ``Early abort loss``. If not, training will be aborted, and may be ' +
          'restarted with a new seed depending on CLI options. By default this is disabled.',
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_float',
        label: 'early_abort_loss',
        name: 'Early abort loss',
        helptext: 'The cutoff for validation loss by ``Early abort epoch``',
        min: 0,
        step: 0.001,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'label_erosion',
        name: 'Label erosion',
        value: [1, 1, 1],
        helptext: 'Amount to erode label mask for each training subvolume in each dimension, ' +
          'in pixels. For example, a value of [0,1,1] will result in erosion with a ' +
          'structuring element of size [1,3,3].',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'relabel_seed_component',
        name: 'Relabel seed component',
        helptext: 'Relabel training subvolumes to only include the seeded connected component.',
        value: false,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'augment_validation',
        name: 'Augment validation',
        helptext: 'Whether validation data should also be augmented.',
        value: true,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'augment_use_both',
        name: 'Augment use both',
        helptext: 'To train on both the original data and augmented data for each subvolume.',
        value: true,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'augment_mirros',
        name: 'Augment mirrors',
        value: [0, 1, 2],
        helptext: 'Axes along which to apply mirror augmentations',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'augment_mirros',
        name: 'Augment mirrors',
        value: [0, 1, 2],
        helptext: 'Axes along which to apply mirror augmentations',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'list_number_list',
        label: 'augment_permute_axes',
        name: 'Augment permute axes',
        helptext: 'TODO\nAxis permutations to use for data augmentation',
        value: [[0, 2, 1]],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'dict_list',
        label: 'augment_missing_data',
        name: 'Augment missing data',
        helptext: 'TODO\nList of dictionaries with ``axis`` and ``prob`` keys, indicating ' +
          'an axis to perform data blanking along, and the probability to blank' +
          'each plane in the axis, respectively.',
        value: [{axis: 0, prob: 0.01}],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'dict_list',
        label: 'augment_noise',
        name: 'Augment noise',
        helptext: 'TODO\nList of dictionaries with ``axis``, ``mul`` and ``add`` keys, indicating ' +
          'an axis to perform independent Gaussian noise augmentation on, and the standard deviations ' +
          'of 1-mean multiplicative and 0-mean additive noise, respectively.',
        value: [{axis: 0, mul: 0.1, add: 0.1}],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'dict_list',
        label: 'augment_contrast',
        name: 'Augment contrast',
        helptext: 'TODO\nList of dictionaries with ``axis``, ``prob``, ``scaling_mean``' +
          '``scaling_std``, ``center_mean`` and ``center_std`` keys. These' +
          'specify the probability to alter the contrast of a section, the mean' +
          'and standard deviation to draw from a normal distribution to scale' +
          'contrast, and the mean and standard deviation to draw from a normal' +
          'distribution to move the intensity center multiplicatively.',
        value: [
          {
            axis: 0,
            prob: 0.05,
            scaling_mean: 0.5,
            scaling_std: 0.1,
            center_mean: 1.2,
            center_std: 0.2,
          },
        ],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'dict_list',
        label: 'augment_artifacts',
        name: 'Augment artifacts',
        helptext: 'TODO\nList of dictionaries with ``axis``, ``prob`` and ``volume_file``' +
          'keys, indicating an axis to perform data artifacting along, the' +
          'probability to add artifacts to each plane in the axis, and the' +
          'volume configuration file from which to draw artifacts, respectively.',
        value: [],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'vary_noise',
        name: 'Vary noise',
        helptext: 'Randomly vary the intensity of multiplicative and additive by ' +
          'some factor in (0,1).',
        value: false,
      });
    };

    let createDiluvianPostprocessingDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'postprocessing');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'closing_shape',
        name: 'Closing shape',
        helptext: 'Shape of the structuring element for morphological closing, in voxels',
        value: [],
      });
    };

    let createDiluvianServerDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'server');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'gpus',
        name: 'GPU ids',
        helptext: 'GPU ids to use for data-parallelism.',
        value: [],
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'num_workers',
        name: 'Number of workers',
        helptext: 'Number of worker queues to use for generating training data.',
        value: 4,
        min: 0,
        step: 1,
      });
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
      /**
       * Diluvian Training settings partially implemented. Not yet support
       * due to the fact that the widget probably shouldn't be used for
       * training models, rather the widgets main purpose is for the easy
       * application of production ready models.
       */
      // createDiluvianTrainingDefaults (sub_settings);
      createDiluvianPostprocessingDefaults (sub_settings);
      createDiluvianServerDefaults (sub_settings);
    };

    /**
     * These settings control everything to do with input
     * configuration. Choosing the skeleton, strahler index,
     * etc. etc.
     * @param {*} settings 
     */
    let createRunDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'run');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'skeleton_id',
        name: 'Skeleton id',
        helptext: 'The id of the skeleton to be used for flood filling',
        value: 1,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'resample',
        name: 'Resample',
        value: true,
        helptext: 'Whether or not you want to resample the skeleton at ' +
          'regular intervals. This is highly recommended for floodfilling.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'resampling_delta',
        name: 'Resampling delta',
        helptext: 'The distance to use when downsampling a skeleton. ' +
          'Each new neuron will have approximately a distance of delta ' +
          'nm to its neighbors',
        value: 1000,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'filter_by_strahler',
        name: 'Filter by strahler index',
        value: true,
        helptext: 'Whether or not you want to filter out sections of the skeleton ' +
          'based on the strahler index.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'strahler_filter',
        name: 'Strahler filter',
        helptext: 'The minimum strahler index to perform flood filling on.',
        value: 0,
        min: 0,
        step: 1,
      });
    };

    let createDefaults = function (settings) {
      // Add all settings
      createServerDefaults (settings);
      createDiluvianDefaults (settings);
      createRunDefaults (settings);
    };

    createDefaults (this.settings);
  };

  /*
  --------------------------------------------------------------------------------
  ADMIN
  This section just registers the widget
  */

  FloodfillingWidget.prototype.destroy = function () {
    this.unregisterInstance ();
    this.unregisterSource ();
  };

  CATMAID.FloodfillingWidget = FloodfillingWidget;

  CATMAID.registerWidget ({
    name: 'floodfilling Widget',
    description: 'Widget associated with the floodfilling app',
    key: 'floodfilling-widget',
    creator: FloodfillingWidget,
  });
}) (CATMAID);

/*
let initOptionList = function (args, newSelectedChoices) {
      return args
        .get_choices (project.id)
        .then (function (json) {
          let choices = json
            .sort (function (a, b) {
              return CATMAID.tools.compareStrings (a.name, b.name);
            })
            .map (function (choice) {
              return {
                title: choice['name'],
                value: choice['id'],
              };
            });
          if (args.mode === 'radio') {
            let selectedChoices = newSelectedChoices || args.selectedChoices;
            if (selectedChoices.length > 1) {
              throw new CATMAID.ValueError (
                'Radio select only takes one selected option'
              );
            }
            // Create actual element based on the returned data
            let node = CATMAID.DOM.createRadioSelect (
              'Choices',
              choices,
              selectedChoices[0],
              true
            );
            // Add a selection handler
            node.onchange = function (e) {
              let choiceId = parseInt (e.target.value, 10);
              let selected = true;

              if (CATMAID.tools.isFn (args.select)) {
                args.select (choiceId, selected, e.target);
              }
            };
            return node;
          } else {
            let selectedChoices = newSelectedChoices || args.selectedChoices;
            // Create actual element based on the returned data
            let node = CATMAID.DOM.createCheckboxSelect (
              'Choices',
              choices,
              selectedChoices,
              true,
              args.rowCallback
            );

            // Add a selection handler
            node.onchange = function (e) {
              let selected = e.target.checked;
              let choiceId = parseInt (e.target.value, 10);

              if (CATMAID.tools.isFn (args.select)) {
                args.select (choiceId, selected, e.target);
              }
            };
            return node;
          }
        })
        .catch (function (e) {
          CATMAID.msg ('warn', 'unknown project id: ' + project.id);
        });
    };

    let createAsyncOptionDropdown = function (args) {
      let optionDropdownWrapper = document.createElement ('span');
      let optionDropdown;
      optionDropdown = CATMAID.DOM
        .createLabeledAsyncPlaceholder (
          args.label,
          initOptionList (args),
          args.name
        )
        .get (0);
      optionDropdownWrapper.appendChild (optionDropdown);
      optionDropdownWrapper.refresh = function (newSelectedIds) {
        while (0 !== optionDropdownWrapper.children.length) {
          optionDropdownWrapper.removeChild (optionDropdownWrapper.children[0]);
        }
        let optionDropdown = CATMAID.DOM
          .createLabeledAsyncPlaceholder (
            args.label,
            initOptionList (args, newSelectedIds),
            args.title
          )
          .get (0);
        optionDropdownWrapper.appendChild (optionDropdown);
      };
      return optionDropdownWrapper;
    };




      } else if (setting.type === 'async_option_dropdown') {
        container.append (createAsyncOptionDropdown (setting));
*/
