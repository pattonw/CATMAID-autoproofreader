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

    this.ongoingTable = null;
    this.finishedTable = null;
    this.configJsons = {};
    this.settings = {};

    this.supported_fields = [];
  };

  FloodfillingWidget.prototype = Object.create (
    CATMAID.SkeletonSource.prototype
  );

  FloodfillingWidget.prototype.constructor = FloodfillingWidget;

  $.extend (FloodfillingWidget.prototype, new InstanceRegistry ());

  FloodfillingWidget.prototype.getName = function () {
    return 'Autoproofreading Widget ' + this.widgetID;
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
          ['Segment', this.floodfill.bind (this)],
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

        CATMAID.DOM.appendToTab (tabs['Jobs'], [
          ['refresh', this.test_results_refresh.bind (this)],
          ['clear', this.test_results_clear.bind (this)],
        ]);

        CATMAID.DOM.appendToTab (tabs['Results'], [
          ['refresh', this.test_results_refresh.bind (this)],
          ['clear', this.test_results_clear.bind (this)],
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
                  <th>Run Time (hours)
                  </th>
                  <th>Name
                    <input type="text" name="searchJobName" id="${jobsTableID}-search-job-name"
                      value="" class="search_init"/>
                  </th>
                  <th>Status
                    <input type="text" name="searchJobStatus" id="${jobsTableID}-search-job-status"
                      value="" class="search_init"/>
                  </th>
                  <th>Model
                    <input type="text" name="searchModelName" id="${jobsTableID}-search-model-name"
                      value="" class="search_init"/>
                  </th>
                  <th>Skeleton ID
                  </th>
                </tr>
              </thead>
              <tfoot>
                <tr>
                  <th>run time</th>
                  <th>name</th>
                  <th>status</th>
                  <th>model</th>
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
                  <th>Run Time (hours)
                  </th>
                  <th>Name
                    <input type="text" name="searchJobName" id="${resultsTableID}-search-job-name"
                      value="" class="search_init"/>
                  </th>
                  <th>Status
                    <input type="text" name="searchJobStatus" id="${resultsTableID}-search-job-status"
                      value="" class="search_init"/>
                  </th>
                  <th>Model
                    <input type="text" name="searchModelName" id="${resultsTableID}-search-model-name"
                      value="" class="search_init"/>
                  </th>
                  <th>Skeleton ID
                  </th>
                </tr>
              </thead>
              <tfoot>
                <tr>
                  <th>run time</th>
                  <th>name</th>
                  <th>status</th>
                  <th>model</th>
                  <th>skeleton ID</th>
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
    this.gatherFiles ()
      .then (function (files) {
        self.sendJob (files);
      })
      .catch (CATMAID.handleError);
  };

  FloodfillingWidget.prototype.check_valid_diluvian_job = function (settings) {
    if (
      settings.run.server_id === undefined ||
      settings.run.model_id === undefined
    ) {
      let s = settings.run.server_id === undefined;
      let m = settings.run.model_id === undefined;
      let message;
      if (s && m) {
        message = 'Both server and model not yet selected!';
      } else if (s) {
        message = 'Server not yet selected!';
      } else {
        message = 'Model not yet selected!';
      }
      throw new Error (message);
    }
  };

  FloodfillingWidget.prototype.check_valid_cached_job = function (settings) {
    if (settings.run.segmentation_type != 'watershed') {
      throw new Error ('wierd');
    }
  };

  FloodfillingWidget.prototype.gatherFiles = function () {
    let self = this;
    let setting_values = self.getSettingValues ();
    if (setting_values.run.segmentation_type == 'diluvian') {
      self.check_valid_diluvian_job (setting_values);
    } else if (setting_values.run.segmentation_type == 'watershed') {
      self.check_valid_cached_job (setting_values);
    }
    return self.getVolume ().then (function (volume_config) {
      return self.getSkeleton ().then (function (skeleton_csv) {
        return {
          skeleton: skeleton_csv,
          sarbor_config: toml.dump (setting_values.sarbor),
          volume: toml.dump (volume_config),
          job_config: JSON.stringify (setting_values.run),
          diluvian_config: toml.dump (setting_values['diluvian']),
        };
      });
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
      container.append (file.name, file);
    };
    var post_data = new FormData ();
    add_file (post_data, files.diluvian_config, 'diluvian_config.toml');
    add_file (post_data, files.volume, 'volume.toml');
    add_file (post_data, files.skeleton, 'skeleton.csv');
    add_file (post_data, files.skeleton_config, 'skeleton_config.toml');
    add_file (post_data, files.job_config, 'job_config.json');

    CATMAID.fetch (
      'ext/floodfilling/' + project.id + '/flood-fill',
      'PUT',
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

  // RESULTS
  FloodfillingWidget.prototype.test_results_clear = function () {
    CATMAID.fetch (
      'ext/floodfilling/' + project.id + '/floodfill-results',
      'GET'
    )
      .then (function (results) {
        results.forEach (function (result) {
          CATMAID.fetch (
            'ext/floodfilling/' + project.id + '/floodfill-results',
            'DELETE',
            {result_id: result.id}
          )
            .then (function (delete_reply) {
              console.log (delete_reply);
            })
            .catch (CATMAID.handleError);
        });
      })
      .catch (CATMAID.handleError);
  };

  FloodfillingWidget.prototype.test_results_refresh = function () {
    this.get_jobs ();
  };

  // FLOODFILLING
  FloodfillingWidget.prototype.test_gpuutil = function () {
    let self = this;
    CATMAID.fetch ('ext/floodfilling/' + project.id + '/gpu-util', 'GET', {
      server_id: self.getServer (),
    })
      .then (function (response) {
        console.log (response);
      })
      .catch (CATMAID.handleError);
  };

  FloodfillingWidget.prototype.test_websockets = function () {
    let self = this;
    CATMAID.fetch ('ext/floodfilling/' + project.id + '/flood-fill', 'GET', {
      server_id: self.getServer (),
    })
      .then (function (response) {
        console.log (response);
      })
      .catch (CATMAID.handleError);
  };

  // OPTIC FLOW
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
    let run_settings = self.getSettingValues (self.settings.run);
    let skid = run_settings['skeleton_id'];
    return CATMAID.fetch (project.id + '/skeletons/' + skid + '/compact-detail')
      .then (function (skeleton_json) {
        let arborParser = new CATMAID.ArborParser ();
        let arbor = arborParser.init ('compact-skeleton', skeleton_json).arbor;
        let nodes = getVertices (skeleton_json[0]);
        return self.skeletonToCSV (arbor, nodes);
      })
      .catch (function (error) {
        CATMAID.handleError (error);
      });
  };

  FloodfillingWidget.prototype.skeletonToCSV = function (arbor, nodes) {
    let csv = '';
    for (let i = 0; i < Object.keys (nodes).length; i++) {
      let node_key = Object.keys (nodes)[i];
      csv +=
        node_key +
        ',' +
        (typeof arbor.edges[node_key] === 'undefined'
          ? node_key
          : arbor.edges[node_key]) +
        ',' +
        nodes[node_key].x +
        ',' +
        nodes[node_key].y +
        ',' +
        nodes[node_key].z +
        '\n';
    }
    return csv;
  };

  /*
  --------------------------------------------------------------------------------
  VOLUMES
  This section deals with the volume toml
  */

  FloodfillingWidget.prototype.getImageStackVolume = function () {
    let tileLayers = project.focusedStackViewer.getLayersOfType (
      CATMAID.TileLayer
    );
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
      stackInfo['bounds'] = [
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
      stackInfo['source_base_url'] = stackInfo['image_base'];
      return stackInfo;
    }
  };

  /**
   * Gather the information for the volume toml
   */
  FloodfillingWidget.prototype.getVolume = function () {
    let self = this;
    let setting_values = self.getSettingValues ();
    if ('volume_id' in setting_values.run) {
      return CATMAID.fetch (
        'ext/floodfilling/' + project.id + '/volume-configs',
        'GET',
        {volume_config_id: setting_values.run.volume_id}
      ).then (function (e) {
        console.log ('getting volume config');
        console.log (e);
        let config;
        if (e[0].name == 'default') {
          config = {ImageStack: [self.getImageStackVolume ()]};
        } else {
          config = toml.parse (e[0].config);
        }
        console.log (config);
        return config;
      });
    } else {
      throw Error ('Volume must be selected!');
    }
  };

  /**
   * Save the volume data in a toml
   */
  FloodfillingWidget.prototype.saveVolumes = function () {
    this.saveToml (this.getVolume (), 'volumes');
  };

  /*
  --------------------------------------------------------------------------------
  SERVER
  */

  FloodfillingWidget.prototype.getServer = function () {
    let server = this.getSettingValues (this.settings.run.server_id);
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
        options.push ({name: server[1], id: server[0]});
      });
      self.settings.server.id.options = options;
      self.settings.server.id.value = options.length > 0
        ? options[0].id
        : undefined;
      self.createSettings (self.settings.server);
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
      self.createSettings (settings);
    };
    reader.readAsText (files[0]);
  };

  /*
  --------------------------------------------------------------------------------
  DATA VIS
  */
  FloodfillingWidget.prototype.display_results_data = function (data) {
    console.log (data);
    let display = new CATMAID.ResultsWindow ('RESULTS', undefined, true);
    display.appendRankingTable (data);
    display.show (500, 'auto', true);
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

    this.ongoingTable = $table.DataTable ({
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
          data: 'creation_time',
          render: function (time_string) {
            let start = new Date (time_string);
            let now = new Date ();
            return Math.floor ((now - start) / (10 * 60 * 60)) / 100;
          },
          orderable: true,
          searchable: true,
          className: 'run_time',
        },
        {
          data: 'name',
          orderable: true,
          searchable: true,
          className: 'name',
        },
        {
          data: 'status',
          orderable: true,
          searchable: true,
          className: 'status',
        },
        {
          data: 'model_name',
          orderable: true,
          searchable: true,
          className: 'model_name',
        },
        {
          data: 'skeleton_id',
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

    let exactNumSearch = function (event) {
      if (event.which == 13) {
        event.stopPropagation ();
        event.preventDefault ();
        // Filter with a regular expression
        const filterValue = event.currentTarget.value;
        const regex = filterValue === '' ? '' : `^${filterValue}$`;

        self.ongoingTable
          .column (event.currentTarget.closest ('th'))
          .search (regex, true, false)
          .draw ();
      }
    };

    let stringSearch = function (event) {
      if (event.which == 13) {
        event.stopPropagation ();
        event.preventDefault ();
      }
      // Filter with a regular expression
      let filterValue = event.currentTarget.value;
      let regex = filterValue === '' ? '' : `.*${filterValue}.*`;

      self.ongoingTable
        .column (event.currentTarget.closest ('th'))
        .search (regex, true, false)
        .draw ();
    };

    $ (`#${tableID}-search-job-name`).keyup (stringSearch);
    $ (`#${tableID}-search-job-status`).keyup (stringSearch);
    $ (`#${tableID}-search-model-name`).keyup (stringSearch);

    let $headerInput = $table.find ('thead input');

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

    this.finishedTable = $table.DataTable ({
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
          data: 'creation_time',
          render: function (time_string) {
            let start = new Date (time_string);
            let now = new Date ();
            return Math.floor ((now - start) / (10 * 60 * 60)) / 100;
          },
          orderable: true,
          searchable: true,
          className: 'run_time',
        },
        {
          data: 'name',
          orderable: true,
          searchable: true,
          className: 'name',
        },
        {
          data: 'status',
          orderable: true,
          searchable: true,
          className: 'status',
        },
        {
          data: 'model_name',
          orderable: true,
          searchable: true,
          className: 'model_name',
        },
        {
          data: 'skeleton_id',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: 'skeletonID',
        },
      ],
    });

    $ (`#${tableID} tbody`).on ('click', 'tr', function () {
      self.display_results_data (self.finishedTable.row (this).data ());
    });

    let exactNumSearch = function (event) {
      if (event.which == 13) {
        event.stopPropagation ();
        event.preventDefault ();
        // Filter with a regular expression
        const filterValue = event.currentTarget.value;
        const regex = filterValue === '' ? '' : `^${filterValue}$`;

        self.finishedTable
          .column (event.currentTarget.closest ('th'))
          .search (regex, true, false)
          .draw ();
      }
    };

    let stringSearch = function (event) {
      if (event.which == 13) {
        event.stopPropagation ();
        event.preventDefault ();
      }
      // Filter with a regular expression
      let filterValue = event.currentTarget.value;
      let regex = filterValue === '' ? '' : `.*${filterValue}.*`;

      self.finishedTable
        .column (event.currentTarget.closest ('th'))
        .search (regex, true, false)
        .draw ();
    };

    $ (`#${tableID}-search-job-name`).keyup (stringSearch);
    $ (`#${tableID}-search-job-status`).keyup (stringSearch);
    $ (`#${tableID}-search-model-name`).keyup (stringSearch);

    let $headerInput = $table.find ('thead input');

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

    this.get_jobs ();
  };

  FloodfillingWidget.prototype.get_jobs = function () {
    this.ongoingTable.clear ();
    this.finishedTable.clear ();
    let self = this;
    CATMAID.fetch (
      'ext/floodfilling/' + project.id + '/floodfill-results',
      'GET'
    )
      .then (function (results) {
        results.forEach (function (result) {
          self.appendOne (result);
        });
        self.ongoingTable.draw ();
        self.finishedTable.draw ();
      })
      .catch (CATMAID.handleError);
  };

  FloodfillingWidget.prototype.appendOne = function (job) {
    let self = this;
    if (job.status === 'complete') {
      let row = {
        job_id: job.id,
        creation_time: job.creation_time,
        name: job.name,
        status: job.status,
        config_id: job.config_id,
        model_id: job.model_id,
        model_name: job.model_id,
        skeleton_id: job.skeleton_id,
        skeleton_csv: job.skeleton_csv,
        completion_time: job.completion_time,
        volume_id: job.volume_id,
        data: job.data,
      };
      CATMAID.fetch (
        'ext/floodfilling/' + project.id + '/floodfill-models',
        'GET',
        {model_id: job.model_id}
      ).then (function (result) {
        let model = result[0];
        row.model_name = model.name;
        self.finishedTable.rows.add ([row]);
        self.finishedTable.draw ();
      });
    } else {
      let row = {
        job_id: job.id,
        creation_time: job.creation_time,
        name: job.name,
        status: job.status,
        config_id: job.config_id,
        model_id: job.model_id,
        model_name: job.model_id,
        skeleton_id: job.skeleton_id,
      };
      CATMAID.fetch (
        'ext/floodfilling/' + project.id + '/floodfill-models',
        'GET',
        {model_id: job.model_id}
      ).then (function (result) {
        let model = result[0];
        row.model_name = model.name;
        self.ongoingTable.rows.add ([row]);
        self.ongoingTable.draw ();
      });
    }
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

    let createAsyncOptionDropdown = function (args) {
      var async_placeholder = $ (
        CATMAID.DOM.createLabeledAsyncPlaceholder (
          args.name,
          args.async_init (args.async_change),
          args.helptext
        )
      );

      let addbutton = $ ('<button class="add" />')
        .button ({
          icons: {
            primary: 'ui-icon-plus',
          },
          text: false,
        })
        .click (function () {
          args.async_add ();
        });

      let removebutton = $ ('<button class="remove" />')
        .button ({
          icons: {
            primary: 'ui-icon-minus',
          },
          text: false,
        })
        .click (function () {
          args.async_remove ();
        });

      async_placeholder.find ('div.help').before (addbutton);
      async_placeholder.find ('div.help').before (removebutton);

      /**
       * This function is necessary for refreshing the list when
       * adding or removing servers. 
       * 
       * This parameter must be re-passed since it is a promise
       * and the original one has already resolved and thus will
       * not provide the refreshed results.
       */
      async_placeholder[0].rebuild = function () {
        return createAsyncOptionDropdown (args);
      };

      return async_placeholder;
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
      let newOption = [];
      if (setting.type === 'option_dropdown') {
        newOption.push (createOptionDropdown (setting));
      } else if (setting.type === 'async_option_dropdown') {
        newOption.push (createAsyncOptionDropdown (setting));
      } else if (setting.type === 'numeric_spinner_int') {
        newOption.push (createNumericInputSpinner (setting));
      } else if (setting.type === 'numeric_spinner_float') {
        newOption.push (createNumericInputSpinner (setting));
      } else if (setting.type === 'number_list') {
        newOption.push (createNumberListInput (setting));
      } else if (setting.type === 'string') {
        newOption.push (createStringInput (setting));
      } else if (setting.type === 'checkbox') {
        newOption.push (createCheckbox (setting));
      } else {
        CATMAID.msg ('warn', 'unknown setting type ' + setting.type);
      }
      newOption.forEach (function (item) {
        item[0].id = setting.label;
        container.append (item);
      });
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

    let refresh = function () {
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

    refresh ();
  };

  FloodfillingWidget.prototype.getSettingValues = function (
    settings,
    setting_values
  ) {
    setting_values = setting_values || {};
    settings = settings || this.settings;
    let keys = Object.keys (settings);
    if ('value' in settings) {
      return settings.value;
    }
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
        async_init: args.async_init,
        async_change: args.async_change,
        async_add: args.async_add,
        async_remove: args.async_remove,
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
      } else if (type === 'async_option_dropdown') {
        self.supported_fields.push ('async_option_dropdown');
        return function () {};
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

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'input_resolution',
        name: 'Input resolution',
        helptext: 'The resolution of the segmenting network input. ' +
          'The highest possible resolution is the resolution of the ' +
          'image stack since upsampling is not supported. You may downsample ' +
          'by an arbitrary number of factors of 2 on each axis.',
        value: [
          self.getImageStackVolume ().resolution[2],
          self.getImageStackVolume ().resolution[1],
          self.getImageStackVolume ().resolution[0],
        ],
        min: 0,
        step: 1,
      });
    };

    let change_volume = function (volume_id) {
      console.log ('changing volume');
      self.settings.run.volume_id.value = volume_id;
    };

    let initVolumeList = function (change_func) {
      return CATMAID.fetch (
        'ext/floodfilling/' + project.id + '/volume-configs',
        'GET'
      ).then (function (json) {
        var volumes = json
          .sort (function (a, b) {
            return CATMAID.tools.compareStrings (a.name, b.name);
          })
          .map (function (volume) {
            return {
              title: volume.name + ' (#' + volume.id + ')',
              value: volume.id,
            };
          });
        var selectedVolumeId = self.settings.run.volume_id.value;
        // Create actual element based on the returned data
        var node = CATMAID.DOM.createRadioSelect (
          'Volumes',
          volumes,
          selectedVolumeId,
          true
        );
        // Add a selection handler
        node.onchange = function (e) {
          let volumeId = null;
          if (e.srcElement.value !== 'none') {
            volumeId = parseInt (e.srcElement.value, 10);
          }
          change_func (volumeId);
        };

        return node;
      });
    };

    function add_volume () {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog ('Add Volume');

      dialog.appendMessage ('Please provide the necessary information:');
      let volume_name = dialog.appendField ('Volume name: ', 'volume_name', '');

      let config;
      var fileButton = CATMAID.DOM.createFileButton (
        undefined,
        false,
        function (evt) {
          let reader = new FileReader ();
          reader.onload = function (e) {
            config = reader.result;
          };
          reader.readAsText (evt.target.files[0]);
        }
      );
      let configbutton = $ ('<button class="uploadSettingsFile" />')
        .button ({
          icons: {
            primary: 'ui-icon-arrowthick-1-n',
          },
          text: false,
        })
        .click (function () {
          fileButton.click ();
        });
      dialog.appendChild (configbutton[0]);

      // Add handler for creating the server
      dialog.onOK = function () {
        return CATMAID.fetch (
          'ext/floodfilling/' + project.id + '/volume-configs',
          'PUT',
          {
            name: volume_name.value,
            config: config,
          }
        )
          .then (function (e) {
            // refresh the server list
            let replacement = $ ('#volume_id')[0].rebuild ();
            $ ('#volume_id').empty ();
            $ ('#volume_id').append (replacement);
          })
          .catch (CATMAID.handleError);
      };

      dialog.show (500, 'auto', true);
    }

    function remove_volume () {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog ('Remove Volume');

      dialog.appendMessage ('Please select a volume:');
      let volume = self.settings.run.volume_id.value;
      let change_func = function (volume_id) {
        volume = volume_id;
      };
      dialog.appendChild (
        CATMAID.DOM.createLabeledAsyncPlaceholder (
          'Compute volume',
          initVolumeList (change_func),
          'The volume to remove.'
        )
      );

      // Add handler for creating the server
      dialog.onOK = function () {
        CATMAID.fetch (
          'ext/floodfilling/' + project.id + '/volume-configs',
          'DELETE',
          {volume_config_id: volume}
        )
          .then (function (e) {
            // refresh the server list
            let replacement = $ ('#volume_id')[0].rebuild ();
            $ ('#volume_id').empty ();
            $ ('#volume_id').append (replacement);
          })
          .catch (CATMAID.handleError);
      };

      dialog.show (500, 'auto', true);
    }

    let change_server = function (server_id) {
      console.log ('changing server');
      self.settings.run.server_id.value = server_id;
      let model_id = self.settings.run.model_id.value;
      if (model_id !== undefined) {
        CATMAID.fetch (
          'ext/floodfilling/' + project.id + '/floodfill-models',
          'GET',
          {model_id: model_id}
        ).then (function (result) {
          let model = result[0];
          if (model.server_id !== server_id) {
            CATMAID.msg (
              'warn',
              'Server does not match the server the selected ' +
                'Model was trained on. Make sure the server specific ' +
                'parameters on the model are correct.'
            );
          }
        });
      }
    };

    let initServerList = function (change_func) {
      return CATMAID.fetch (
        'ext/floodfilling/' + project.id + '/compute-servers',
        'GET'
      ).then (function (json) {
        var servers = json
          .sort (function (a, b) {
            return CATMAID.tools.compareStrings (a.name, b.name);
          })
          .map (function (server) {
            return {
              title: server.name + ' (#' + server.id + ')',
              value: server.id,
            };
          });
        var selectedServerId = self.settings.run.server_id.value;
        // Create actual element based on the returned data
        var node = CATMAID.DOM.createRadioSelect (
          'Servers',
          servers,
          selectedServerId,
          true
        );
        // Add a selection handler
        node.onchange = function (e) {
          let serverId = null;
          if (e.srcElement.value !== 'none') {
            serverId = parseInt (e.srcElement.value, 10);
          }
          change_func (serverId);
        };

        return node;
      });
    };

    function add_server () {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog ('Add Server');

      dialog.appendMessage ('Please provide the necessary information:');
      let server_name = dialog.appendField ('Server name: ', 'server_name', '');
      let server_address = dialog.appendField (
        'Server address: ',
        'server_address',
        'janelia.int.org'
      );

      let environment_source_path = dialog.appendField (
        'Source path for segmenting environment (optional but recommended): ',
        'env_source_path',
        ''
      );
      let diluvian_path = dialog.appendField (
        'Path to the diluvian directory: ',
        'diluvian_path',
        '~/diluvian'
      );
      let results_directory = dialog.appendField (
        'Path to the results directory in diluvian: ',
        'results_directory',
        'results'
      );

      // Add handler for creating the server
      dialog.onOK = function () {
        return CATMAID.fetch (
          'ext/floodfilling/' + project.id + '/compute-servers',
          'PUT',
          {
            name: server_name.value,
            address: server_address.value,
            environment_source_path: environment_source_path.value,
            diluvian_path: diluvian_path.value,
            results_directory: results_directory.value,
          }
        )
          .then (function (e) {
            // refresh the server list
            let replacement = $ ('#server_id')[0].rebuild ();
            $ ('#server_id').empty ();
            $ ('#server_id').append (replacement);
          })
          .catch (CATMAID.handleError);
      };

      dialog.show (500, 'auto', true);
    }

    function remove_server () {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog ('Remove Server');

      dialog.appendMessage ('Please select a server:');
      let server = self.settings.run.server_id.value;
      let change_func = function (server_id) {
        server = server_id;
      };
      dialog.appendChild (
        CATMAID.DOM.createLabeledAsyncPlaceholder (
          'Compute server',
          initServerList (change_func),
          'The server to remove.'
        )
      );

      // Add handler for creating the server
      dialog.onOK = function () {
        CATMAID.fetch (
          'ext/floodfilling/' + project.id + '/compute-servers',
          'DELETE',
          {server_id: server}
        )
          .then (function (e) {
            // refresh the server list
            let replacement = $ ('#server_id')[0].rebuild ();
            $ ('#server_id').empty ();
            $ ('#server_id').append (replacement);
          })
          .catch (CATMAID.handleError);
      };

      dialog.show (500, 'auto', true);
    }

    let change_model = function (model_id) {
      console.log ('changing model');
      self.settings.run.model_id.value = model_id;
      let server_id = self.settings.run.server_id.value;
      CATMAID.fetch (
        'ext/floodfilling/' + project.id + '/floodfill-models',
        'GET',
        {model_id: model_id}
      ).then (function (result) {
        let model = result[0];

        if (server_id !== undefined) {
          if (model.server_id !== server_id) {
            CATMAID.msg (
              'warn',
              'Server does not match the server the selected ' +
                'Model was trained on. Make sure the server specific ' +
                'parameters on the model are correct.'
            );
          }
        } else {
          self.settings.run.server_id.value = model.server_id;
          // refresh the server list
          let replacement = $ ('#server_id')[0].rebuild ();
          $ ('#server_id').empty ();
          $ ('#server_id').append (replacement);
        }
      });
    };

    let initModelList = function (change_func) {
      return CATMAID.fetch (
        'ext/floodfilling/' + project.id + '/floodfill-models',
        'GET'
      ).then (function (json) {
        var models = json
          .sort (function (a, b) {
            return CATMAID.tools.compareStrings (a.name, b.name);
          })
          .map (function (model) {
            return {
              title: model.name + ' (#' + model.id + ')',
              value: model.id,
            };
          });
        var selectedModelId = self.settings.run.model_id.value;
        // Create actual element based on the returned data
        var node = CATMAID.DOM.createRadioSelect (
          'Models',
          models,
          selectedModelId,
          true
        );
        // Add a selection handler
        node.onchange = function (e) {
          let modelId = null;
          if (e.srcElement.value !== 'none') {
            modelId = parseInt (e.srcElement.value, 10);
          }
          change_func (modelId);
        };

        return node;
      });
    };

    function add_model () {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog ('WIP');
      dialog.appendMessage ('Please provide the necessary information:');
      let model_name = dialog.appendField ('Model name: ', 'model_name', '');
      let server = self.settings.run.server_id.value;
      let change_func = function (server_id) {
        server = server_id;
      };
      dialog.appendChild (
        CATMAID.DOM.createLabeledAsyncPlaceholder (
          'Compute server',
          initServerList (change_func),
          'The server to remove.'
        )
      );
      let model_source_path = dialog.appendField (
        'Path to the models weights: ',
        'model_path',
        'trained_models/model.hdf5'
      );
      let config;
      var fileButton = CATMAID.DOM.createFileButton (
        undefined,
        false,
        function (evt) {
          let reader = new FileReader ();
          reader.onload = function (e) {
            config = reader.result;
          };
          reader.readAsText (evt.target.files[0]);
        }
      );
      let configbutton = $ ('<button class="uploadSettingsFile" />')
        .button ({
          icons: {
            primary: 'ui-icon-arrowthick-1-n',
          },
          text: false,
        })
        .click (function () {
          fileButton.click ();
        });
      dialog.appendChild (configbutton[0]);

      // Add handler for creating the model
      dialog.onOK = function () {
        CATMAID.fetch (
          'ext/floodfilling/' + project.id + '/floodfill-models',
          'PUT',
          {
            name: model_name.value,
            server_id: server,
            model_source_path: model_source_path.value,
            config: config,
          }
        )
          .then (function (e) {
            console.log (e);
            // refresh the server list
            let replacement = $ ('#model_id')[0].rebuild ();
            $ ('#model_id').empty ();
            $ ('#model_id').append (replacement);
          })
          .catch (CATMAID.handleError);
      };

      dialog.show (500, 'auto', true);
    }

    function remove_model () {
      // Remove a model
      let dialog = new CATMAID.OptionsDialog ('Remove Model');

      dialog.appendMessage ('Please select a model:');
      let model = self.settings.run.model_id.value;
      let change_func = function (model_id) {
        model = model_id;
      };
      dialog.appendChild (
        CATMAID.DOM.createLabeledAsyncPlaceholder (
          'Floodfill Model',
          initModelList (change_func),
          'The model to remove.'
        )
      );

      // Add handler for removing the model
      dialog.onOK = function () {
        CATMAID.fetch (
          'ext/floodfilling/' + project.id + '/floodfill-models',
          'DELETE',
          {model_id: model}
        )
          .then (function (e) {
            // refresh the server list
            let replacement = $ ('#model_id')[0].rebuild ();
            $ ('#model_id').empty ();
            $ ('#model_id').append (replacement);
          })
          .catch (CATMAID.handleError);
      };

      dialog.show (500, 'auto', true);
    }

    /**
     * These settings control everything to do with running the
     * job on a server. Making sure the server has access to the
     * volumes/models/segmentation_algorithms you want
     * @param {*} settings 
     */
    let createRunDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'run');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'string',
        label: 'job_name',
        name: 'Job name',
        value: '',
        helptext: 'A name for the job so that it can bse easily found ' +
          'later. If left blank the default will be a ' +
          'combination of the skeleton id and the date.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'option_dropdown',
        label: 'segmentation_type',
        name: 'Segmentation type',
        options: [
          {name: 'Diluvian', id: 'diluvian'},
          {name: 'watershed segmentation', id: 'watershed'},
        ],
        helptext: 'Type of segmentation to use in the backend. Diluvian ' +
          'will segment the skeleton on demand which will take some time. ' +
          'watershed segmentation is cached and only needs to be retrieved, which ' +
          'will be faster but you have less options for customizing the job.',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'async_option_dropdown',
        label: 'volume_id',
        name: 'Image source',
        async_init: initVolumeList,
        async_change: change_volume,
        async_add: add_volume,
        async_remove: remove_volume,
        helptext: 'The volume to use for segmenting',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'async_option_dropdown',
        label: 'model_id',
        name: 'Segmenting model',
        async_init: initModelList,
        async_change: change_model,
        async_add: add_model,
        async_remove: remove_model,
        helptext: 'The pretrained model to use for segmenting',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'async_option_dropdown',
        label: 'server_id',
        name: 'Compute server',
        async_init: initServerList,
        async_change: change_server,
        async_add: add_server,
        async_remove: remove_server,
        helptext: 'The compute server to use for segmenting',
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'skeleton_id',
        name: 'Skeleton id',
        helptext: 'The id of the skeleton to be used for segmenting',
        value: 1,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'number_list',
        label: 'gpus',
        name: 'GPUs',
        helptext: 'Which gpus to use for segmenting. ' +
          'Leave blank to use all available gpus.' +
          'If you want to run multiple jobs simultaneously, ' +
          'you will have to choose which gpus to use for each job.',
        value: [],
      });
    };

    /**
     * These settings control everything to do skeleton configuration.
     * Whether to downsample, use strahler indicies, etc. etc.
     * @param {*} settings 
     */
    let createSkeletonDefaults = function (settings) {
      let sub_settings = getSubSettings (settings, 'skeleton');

      addSettingTemplate ({
        settings: sub_settings,
        type: 'checkbox',
        label: 'resample',
        name: 'Resample',
        value: true,
        helptext: 'Whether or not you want to resample the skeleton at ' +
          'regular intervals. This is highly recommended for segmenting.',
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
        label: 'strahler_filter_min',
        name: 'Strahler filter minimum',
        helptext: 'The minimum strahler index to perform segmenting on.',
        value: 0,
        min: 0,
        step: 1,
      });

      addSettingTemplate ({
        settings: sub_settings,
        type: 'numeric_spinner_int',
        label: 'strahler_filter_max',
        name: 'Strahler filter maximum',
        helptext: 'The maximum strahler index to perform flood filling on.',
        value: 10,
        min: 0,
        step: 1,
      });
    };

    let createDefaults = function (settings) {
      // Add all settings
      createRunDefaults (settings);
      createSkeletonDefaults (settings);
      createDiluvianDefaults (settings);
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
    name: 'Autoproofreading Widget',
    description: 'Widget associated with the floodfilling app',
    key: 'floodfilling-widget',
    creator: FloodfillingWidget,
    websocketHandlers: {
      'floodfilling-result-update': function (client, payload) {
        // Update all job tables in floodfilling widgets
        let floodfilling_windows = WindowMaker.getOpenWindows (
          'floodfilling-widget'
        );
        if (floodfilling_windows) {
          for (let widget of floodfilling_windows.values ()) {
            widget.get_jobs ();
          }
        }
      },
    },
  });
}) (CATMAID);
