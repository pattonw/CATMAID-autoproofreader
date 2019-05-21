/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {
  /*
    --------------------------------------------------------------------------------
    SETUP
    */

  "use strict";
  let AutoproofreaderWidget = function() {
    this.widgetID = this.registerInstance();
    this.idPrefix = `autoproofreader-widget${this.widgetID}-`;

    this.ongoingTable = null;
    this.completedTable = null;
    this.rankingTable = null;
    this.configJsons = {};
    this.settings = {};

    this.supported_fields = [];

    this.selected_points = new Set();
    this.ranking_result_id = null;
    this.visibleProofreadLayer = false;
    this.visibleSegmentationLayer = false;

    this.row_highlight_color = "#d6ffb5";
  };

  var toggleProofreadSkeletonProjectionLayers = function() {
    var key = "skeletonprojection";
    var allHaveLayers = project.getStackViewers().every(function(sv) {
      return !!sv.getLayer(key);
    });

    function add(sv) {
      if (sv.getLayer(key)) return;
      // Add new layer, defaulting to the active skelton source for input
      sv.addLayer(key, new CATMAID.ProofreadSkeletonProjectionLayer(sv));
    }
    function remove(sv) {
      if (!sv.getLayer(key)) return;
      sv.removeLayer(key);
      sv.redraw();
    }

    var fn = allHaveLayers ? remove : add;
    project.getStackViewers().forEach(fn);
  };

  AutoproofreaderWidget.prototype = Object.create(
    CATMAID.SkeletonSource.prototype
  );

  AutoproofreaderWidget.prototype.constructor = AutoproofreaderWidget;

  $.extend(AutoproofreaderWidget.prototype, new InstanceRegistry());

  AutoproofreaderWidget.prototype.getName = function() {
    return "Autoproofreading Widget " + this.widgetID;
  };

  AutoproofreaderWidget.prototype.getWidgetConfiguration = function() {
    const queuedTableId = this.idPrefix + "datatable-queued";
    const completedTableId = this.idPrefix + "datatable-completed";
    const rankingTableId = this.idPrefix + "datatable-rankings";
    let self = this;
    return {
      helpText: "Automated proofreading Widget: ",
      controlsID: this.idPrefix + "controls",
      createControls: function(controls) {
        // Create the tabs
        let tabs = CATMAID.DOM.addTabGroup(controls, this.widgetID, [
          "Run",
          "Queued",
          "Completed",
          "Rankings"
        ]);
        // Change content based on currently active tab
        controls.firstChild.onclick = this.refocus.bind(this);

        var fileButton = CATMAID.DOM.createFileButton(
          undefined,
          false,
          function(evt) {
            self.uploadSettingsToml(evt.target.files, self.settings);
          }
        );

        // create validation tab
        CATMAID.DOM.appendToTab(tabs["Run"], [
          ["Segment", this.proofread.bind(this)],
          [
            "Download Settings",
            function() {
              self.saveToml(
                self.getSettingValues(self.settings),
                "ff_widget_settings.toml"
              );
            }
          ],
          [
            "Upload Settings",
            function() {
              fileButton.click();
            }
          ]
        ]);

        CATMAID.DOM.appendToTab(tabs["Queued"], [
          ["refresh", this.test_results_refresh.bind(this)],
          ["clear", this.test_results_clear.bind(this)]
        ]);

        CATMAID.DOM.appendToTab(tabs["Completed"], [
          ["refresh", this.test_results_refresh.bind(this)],
          ["clear", this.test_results_clear.bind(this)]
        ]);

        CATMAID.DOM.appendToTab(tabs["Rankings"], [
          {
            type: "checkbox",
            value: self.ProofreadSkeletonVisualizationLayer,
            label: "Show proofread layer",
            onclick: function() {
              self.visibleProofreadLayer = this.checked;
              self.updateProofreadSkeletonVisualizationLayer();
            }
          },
          {
            type: "checkbox",
            value: self.ProofreadSegmentationLayer,
            label: "Show segmentations layer",
            onclick: function() {
              self.visibleSegmentationLayer = this.checked;
              self.updateProofreadSegmentationLayer();
            }
          }
        ]);
        $(controls).tabs();
      },
      contentID: this.idPrefix + "content",
      createContent: function(container) {
        container.innerHTML = `
        <div id="content-wrapper">
          <div class="queued">
            <table cellpadding="0" cellspacing="0" border="0" class="display" id="${queuedTableId}">
              <thead>
                <tr>
                  <th title="Remove one or all neurons"></th>
                  <th>Run time (hours)</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Skeleton ID</th>
                </tr>
                <tr>
                  <th><i class="fa fa-remove" id="${queuedTableId}-remove-all-queued" title="Remove all"></i></th>
                  <th></th>
                  <th>
                    <input type="text" name="searchJobName" placeholder="name filter" id="${queuedTableId}-search-job-name"
                      value="" class="search_init"/>
                  </th>
                  <th>
                    <input type="text" name="searchJobStatus" placeholder="status filter" id="${queuedTableId}-search-job-status"
                      value="" class="search_init"/>
                  </th>
                  <th>
                  <input type="text" name="searchSkeletonId" placeholder="skeleton filter" id="${queuedTableId}-search-skeleton-id"
                    value="" class="search_init"/>
                  </th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            </table>
          </div>
          <div class="completed">
            <table cellpadding="0" cellspacing="0" border="0" class="display" id="${completedTableId}">
              <thead>
                <tr>
                  <th title="Remove one or all neurons">
                  </th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Skeleton ID</th>
                  <th title="Limit data access to yourself or all with browse permission">private</th>
                  <th title="Mark data as permanent, else it will be wiped after 24 hours">permanent</th>
                  <th>Actions</th>
                </tr>
                <tr>
                  <th><i class="fa fa-remove" id="${completedTableId}-remove-all-queued" title="Remove all"></i></th>
                  <th>
                    <input type="text" name="searchJobName" placeholder="name filter" id="${completedTableId}-search-job-name"
                      value="" class="search_init"/>
                  </th>
                  <th>
                    <input type="text" name="searchJobStatus" placeholder="status filter" id="${completedTableId}-search-job-status"
                      value="" class="search_init"/>
                  </th>
                  <th>
                  <input type="text" name="searchSkeletonId" placeholder="skeleton filter" id="${completedTableId}-search-skeleton-id"
                    value="" class="search_init"/>
                  </th>
                  <th><input type="checkbox" id="${completedTableId}-mark-all-private" style="float: left" /></th>
                  <th><input type="checkbox" id="${completedTableId}-mark-all-permanent" style="float: left" /></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            </table>
          </div>
          <div class="rankings">
            <table cellpadding="0" cellspacing="0" border="0" class="display" id="${rankingTableId}">
              <thead>
                <tr>
                  <th>node id
                  </th>
                  <th>parent id
                  </th>
                  <th>Connectivity score
                  </th>
                  <th>Branch score
                  </th>
                  <th>Reviewed
                  </th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            </table>
          </div>
          <div class="settings" id="settings">
          </div>
        </div>`;

        let completedTableContainer = $(`#${completedTableId}`, container);
        $(completedTableContainer)
          .on("click", "td .action-remove", this, function(e) {
            let row = completedTableContainer
              .DataTable()
              .row(this.closest("tr"));
            let result = row.data();
            row.remove().draw();
            CATMAID.fetch(
              `ext/autoproofreader/${project.id}/autoproofreader-results`,
              "DELETE",
              { result_id: result.id }
            );
          })
          .on("click", "td .action-select", this, function(e) {
            let row = completedTableContainer
              .DataTable()
              .row(this.closest("tr"));
            self.display_results_data(row.data());
            // Reset highlighting
            $("tbody tr", completedTableContainer).css("background-color", "");
            // Add new highlighting
            $(row.node()).css("background-color", self.row_highlight_color);
          })
          .on("click", "td .action-toggle", this, function(e) {
            let self = this;

            // let the browser handle the check
            setTimeout(function() {
              // then undo it and wait for async behavior to finish
              let toggle_prop = $(self).attr("data-action");
              let params = {
                result_id: completedTableContainer
                  .DataTable()
                  .row(self.closest("tr"))
                  .data().id
              };
              params[toggle_prop] = true;
              CATMAID.fetch(
                `ext/autoproofreader/${project.id}/autoproofreader-results`,
                "PATCH",
                params
              )
                .then(response => {
                  // set checkbox appropriately depending on the response.
                  $(self).prop("checked", response[toggle_prop]);
                })
                .catch(e => {
                  CATMAID.handleError(e);
                });
            }, 0);

            // hopefully prevent checkbox from being checked.
            e.preventDefault();
            e.stopPropagation();
          });
      },
      init: this.init.bind(this)
    };
  };

  /**
   * initialize the widget
   */
  AutoproofreaderWidget.prototype.init = function() {
    this.initTables();

    this.initSettings();

    this.refocus();
  };

  /**
   * Change the widget layout to show the appropriate content per tab.
   */
  AutoproofreaderWidget.prototype.refocus = function() {
    let content = document.getElementById("content-wrapper");
    let views = {
      Run: "settings",
      Queued: "queued",
      Completed: "completed",
      Rankings: "rankings"
    };
    let mode = $("ul.ui-tabs-nav")
      .children(".ui-state-active")
      .text();
    for (let child of content.childNodes) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        child.className === views[mode]
      ) {
        child.style.display = "block";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        child.style.display = "none";
      }
    }
  };

  /*
    --------------------------------------------------------------------------------
    RUNNING
    */

  AutoproofreaderWidget.prototype.proofread = function() {
    let self = this;
    this.gatherFiles()
      .then(function(files) {
        self.sendJob(files);
      })
      .catch(CATMAID.handleError);
  };

  AutoproofreaderWidget.prototype.check_valid_diluvian_job = function(
    settings
  ) {
    if (
      settings.run.server_id === undefined ||
      settings.run.model_id === undefined
    ) {
      let s = settings.run.server_id === undefined;
      let m = settings.run.model_id === undefined;
      let message;
      if (s && m) {
        message = "Both server and model not yet selected!";
      } else if (s) {
        message = "Server not yet selected!";
      } else {
        message = "Model not yet selected!";
      }
      throw new Error(message);
    }
  };

  AutoproofreaderWidget.prototype.check_valid_cached_job = function(settings) {
    if (settings.run.segmentation_type != "watershed") {
      throw new Error("wierd");
    }
  };

  AutoproofreaderWidget.prototype.gatherFiles = function() {
    let self = this;
    let setting_values = self.getSettingValues();
    if (setting_values.run.segmentation_type == "diluvian") {
      self.check_valid_diluvian_job(setting_values);
    } else if (setting_values.run.segmentation_type == "watershed") {
      self.check_valid_cached_job(setting_values);
    }
    return self.getVolume().then(function(volume_config) {
      return self.getSkeleton().then(function(skeleton_csv) {
        return {
          skeleton: skeleton_csv,
          sarbor_config: toml.dump(setting_values.sarbor),
          volume: toml.dump(volume_config),
          job_config: JSON.stringify(setting_values.run),
          diluvian_config: toml.dump(setting_values["diluvian"])
        };
      });
    });
  };

  AutoproofreaderWidget.prototype.sendJob = function(files) {
    let add_file = function(container, data, file_name) {
      let file = new File(
        [
          new Blob([data], {
            type: "text/plain"
          })
        ],
        file_name
      );
      container.append(file.name, file);
    };
    var post_data = new FormData();
    add_file(post_data, files.diluvian_config, "diluvian_config.toml");
    add_file(post_data, files.volume, "volume.toml");
    add_file(post_data, files.skeleton, "skeleton.csv");
    add_file(post_data, files.sarbor_config, "sarbor_config.toml");
    add_file(post_data, files.job_config, "job_config.json");

    console.log(files.job_config);

    CATMAID.fetch(
      "ext/autoproofreader/" + project.id + "/autoproofreader",
      "PUT",
      post_data,
      undefined,
      undefined,
      undefined,
      undefined,
      { "Content-type": null }
    )
      .then(function(e) {
        console.log(e);
      })
      .catch(function(error) {
        CATMAID.handleError(error);
      });
  };

  /*
    --------------------------------------------------------------------------------
    TESTING
    */

  // RESULTS
  AutoproofreaderWidget.prototype.test_results_clear = function() {
    CATMAID.fetch(
      "ext/autoproofreader/" + project.id + "/autoproofreader-results",
      "GET"
    )
      .then(function(results) {
        results.forEach(function(result) {
          CATMAID.fetch(
            "ext/autoproofreader/" + project.id + "/autoproofreader-results",
            "DELETE",
            { result_id: result.id }
          )
            .then(function(delete_reply) {
              console.log(delete_reply);
            })
            .catch(CATMAID.handleError);
        });
      })
      .catch(CATMAID.handleError);
  };

  AutoproofreaderWidget.prototype.test_results_refresh = function() {
    this.get_jobs();
  };

  // AUTOMATIC PROOFREADING
  AutoproofreaderWidget.prototype.test_gpuutil = function() {
    let self = this;
    CATMAID.fetch("ext/autoproofreader/" + project.id + "/gpu-util", "GET", {
      server_id: self.getServer()
    })
      .then(function(response) {
        console.log(response);
      })
      .catch(CATMAID.handleError);
  };

  AutoproofreaderWidget.prototype.test_websockets = function() {
    let self = this;
    CATMAID.fetch(
      "ext/autoproofreader/" + project.id + "/autoproofreader",
      "GET",
      {
        server_id: self.getServer()
      }
    )
      .then(function(response) {
        console.log(response);
      })
      .catch(CATMAID.handleError);
  };

  // OPTIC FLOW
  AutoproofreaderWidget.prototype.testOpticalFlow = function() {
    let tileLayers = project.focusedStackViewer.getLayersOfType(
      CATMAID.TileLayer
    );
    let i = 0;
    let tileLayer = tileLayers[i];
    // Only get a visible tile layers
    while (!tileLayer.visible) {
      if (i > tileLayers.length) {
        throw "no visible layers";
      }
      i = i + 1;
      tileLayer = tileLayers[i];
    }

    let tileSource = tileLayer.stack.createTileSourceForMirror(
      tileLayer.mirrorIndex
    );

    CATMAID.fetch(
      project.id + "/skeletons/" + 18277211 + "/compact-detail"
    ).then(function(skeleton) {
      let nodes = skeleton[0];
      let nodes100 = nodes.slice(100, 200);

      Promise.all(nodes100.map(node => optic_flow(nodes, node))).then(function(
        moves
      ) {
        let move_metrics = moves.map(function(result) {
          if (result) {
            let theta_a = Math.atan2(result[0][0], result[0][1]);
            let mag_a = Math.sqrt(
              Math.pow(result[0][0], 2) + Math.pow(result[0][1], 2)
            );
            let theta_b = Math.atan2(result[1][0], result[1][1]);
            let mag_b = Math.sqrt(
              Math.pow(result[1][0], 2) + Math.pow(result[1][1], 2)
            );
            return [
              Math.min(theta_b - theta_a, 2 * Math.PI - (theta_b - theta_a)),
              Math.abs((mag_b - mag_a) / mag_b)
            ];
          }
        });
        let totals = move_metrics.reduce(
          function(acc, cur) {
            if (typeof cur !== "undefined") {
              acc[0] = acc[0] + Math.abs(cur[0]);
              acc[1] = acc[1] + Math.abs(cur[1]);
            }
            return acc;
          },
          [0, 0]
        );
        console.log(move_metrics);
        console.log(totals);
      });
    });

    let optic_flow = function(nodes, current) {
      let moves = [];
      moves.push(current.slice());
      if (current[5] < get_node(nodes, current[1])[5]) {
        let next_frame = current.slice();
        next_frame[5] = next_frame[5] + tileLayer.stack.resolution.z;
        moves.push(next_frame);
      } else if (current[5] > get_node(nodes, current[1])[5]) {
        let next_frame = current.slice();
        next_frame[5] = next_frame[5] - tileLayer.stack.resolution.z;
        moves.push(next_frame);
      }

      if (moves.length > 1) {
        return Promise.all(moves.map(node => get_node_data(node))).then(
          function(canvases) {
            let data = [];
            for (let canvas of canvases) {
              data.push(get_data(canvas));
            }
            let move = get_move(data, nodes, current);
            plot_change(canvases, [move[2], move[3]]);
            return [move[0], move[1]];
          }
        );
      }
    };

    let plot_change = function(canvases, node_moves) {
      let ctx0 = canvases[0].getContext("2d");
      let ctx1 = canvases[1].getContext("2d");
      for (let i = 0; i < node_moves[1].length / 2; i++) {
        ctx0.beginPath();
        ctx0.arc(
          node_moves[0][i * 2],
          node_moves[0][i * 2 + 1],
          3,
          0,
          2 * Math.PI
        );
        ctx0.fillStyle = "red";
        ctx0.fill();
        ctx1.beginPath();
        ctx1.arc(
          node_moves[1][i * 2],
          node_moves[1][i * 2 + 1],
          3,
          0,
          2 * Math.PI
        );
        ctx1.fillStyle = "red";
        ctx1.fill();
      }
    };

    let get_move = function(data, nodes, node) {
      if (data.length === 2) {
        let parent = get_node(nodes, node[1]);
        let expected_change = [parent[3] - node[3], parent[4] - node[4]];

        let levels = 3,
          start_width = 256,
          start_height = 256,
          data_type = jsfeat.U8_t | jsfeat.C1_t;
        let prev_pyr = new jsfeat.pyramid_t(levels);

        // this will populate data property with matrix_t instances
        prev_pyr.allocate(start_width, start_height, data_type);
        prev_pyr.build(data[0]);

        let curr_pyr = new jsfeat.pyramid_t(levels);

        // this will populate data property with matrix_t instances
        curr_pyr.allocate(start_width, start_height, data_type);
        curr_pyr.build(data[1]);

        let prev_xy = new Float32Array(100 * 2),
          curr_xy = new Float32Array(100 * 2),
          count = 0,
          win_size = 10,
          max_iter = 30,
          status = new Uint8Array(100),
          eps = 0.01,
          min_eigen_threshold = 0.0001;

        for (let i = 0; i < 5; i++) {
          for (let j = 0; j < 5; j++) {
            count = add_point(
              prev_xy,
              128 + 10 * (i - 2),
              128 + 10 * (j - 2),
              count
            );
          }
        }

        jsfeat.optical_flow_lk.track(
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
          let a_x = prev_xy[2 * i],
            a_y = prev_xy[2 * i + 1];
          let b_x = curr_xy[2 * i],
            b_y = curr_xy[2 * i + 1];
          total_change[0] = total_change[0] + b_x - a_x;
          total_change[1] = total_change[1] + b_y - a_y;
        }
        let change = total_change.map(total => total / count);
        return [
          expected_change,
          change,
          prev_xy.slice(0, count * 2),
          curr_xy.slice(0, count * 2)
        ];
      }
    };

    let add_point = function(xy, x, y, count) {
      xy[count << 1] = x;
      xy[(count << 1) + 1] = y;
      return count + 1;
    };

    let get_node = function(nodes, id) {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i][0] === id) {
          return nodes[i];
        }
      }
    };

    let get_node_data = function(node) {
      let z_coord =
        (node[5] - tileLayer.stack.translation.z) /
        tileLayer.stack.resolution.z;
      let y_coord = [
        (node[4] - tileLayer.stack.translation.y) / tileLayer.stack.resolution.y
      ];
      let x_coord = [
        (node[3] - tileLayer.stack.translation.x) / tileLayer.stack.resolution.x
      ];

      let center_x =
        x_coord[0] -
        Math.floor(x_coord[0] / tileSource.tileWidth) * tileSource.tileWidth;
      let center_y =
        y_coord[0] -
        Math.floor(y_coord[0] / tileSource.tileHeight) * tileSource.tileHeight;

      if (center_x < 128) {
        x_coord.push(x_coord[0] - 512);
      } else if (512 - center_x < 128) {
        x_coord.push(x_coord[0] + 512);
      }
      if (center_y < 128) {
        y_coord.push(y_coord[0] - 512);
      } else if (512 - center_y < 128) {
        y_coord.push(y_coord[0] + 512);
      }

      let canvas = document.createElement("canvas");
      canvas.setAttribute("height", 256);
      canvas.setAttribute("width", 256);

      let promises = [];
      for (let i = 0; i < x_coord.length; i++) {
        for (let j = 0; j < y_coord.length; j++) {
          promises.push(
            new Promise(resolve => {
              let img = document.createElement("img");
              img.crossOrigin = "Anonymous";
              img.setAttribute(
                "src",
                tileSource.getTileURL(
                  project.id,
                  tileLayer.stack,
                  [z_coord],
                  Math.floor(x_coord[i] / tileSource.tileWidth),
                  Math.floor(y_coord[j] / tileSource.tileHeight),
                  0
                )
              );
              img.onload = function() {
                let ctx = canvas.getContext("2d");
                ctx.drawImage(
                  img,
                  x_coord[i] -
                    x_coord[0] -
                    (x_coord[0] -
                      Math.floor(x_coord[0] / tileSource.tileWidth) *
                        tileSource.tileWidth) +
                    128,
                  y_coord[j] -
                    y_coord[0] -
                    (y_coord[0] -
                      Math.floor(y_coord[0] / tileSource.tileHeight) *
                        tileSource.tileHeight) +
                    128
                );
                resolve();
              };
            })
          );
        }
      }
      return new Promise(function(resolve) {
        Promise.all(promises).then(function(e) {
          resolve(canvas, node);
        });
      });
    };

    let get_data = function(canvas) {
      $("#content-wrapper").append(canvas);
      let ctx = canvas.getContext("2d");
      let width = 256;
      let height = 256;
      var image_data = ctx.getImageData(0, 0, width, height);

      var gray_img = new jsfeat.matrix_t(
        width,
        height,
        jsfeat.U8_t | jsfeat.C1_t
      );
      var code = jsfeat.COLOR_RGBA2GRAY;
      jsfeat.imgproc.grayscale(image_data.data, width, height, gray_img, code);
      return gray_img;
    };
  };

  /*
    --------------------------------------------------------------------------------
    SKELETONS
    */

  let getVertices = function(nodes) {
    return nodes.reduce((vs, vertex) => {
      vs[vertex[0]] = new THREE.Vector3(...vertex.slice(3, 6));
      return vs;
    }, {});
  };

  AutoproofreaderWidget.prototype.getSkeleton = function() {
    let self = this;
    let run_settings = self.getSettingValues(self.settings.run);
    let skid = run_settings["skeleton_id"];
    return CATMAID.fetch(project.id + "/skeletons/" + skid + "/compact-detail")
      .then(function(skeleton_json) {
        let arborParser = new CATMAID.ArborParser();
        let arbor = arborParser.init("compact-skeleton", skeleton_json).arbor;
        let nodes = getVertices(skeleton_json[0]);
        return self.skeletonToCSV(arbor, nodes);
      })
      .catch(function(error) {
        CATMAID.handleError(error);
      });
  };

  AutoproofreaderWidget.prototype.skeletonToCSV = function(arbor, nodes) {
    let csv = "";
    for (let i = 0; i < Object.keys(nodes).length; i++) {
      let node_key = Object.keys(nodes)[i];
      csv +=
        node_key +
        "," +
        (typeof arbor.edges[node_key] === "undefined"
          ? node_key
          : arbor.edges[node_key]) +
        "," +
        nodes[node_key].x +
        "," +
        nodes[node_key].y +
        "," +
        nodes[node_key].z +
        "\n";
    }
    return csv;
  };

  /*
    --------------------------------------------------------------------------------
    VOLUMES
    This section deals with the volume toml
    */

  AutoproofreaderWidget.prototype.getImageStackVolume = function() {
    let tileLayers = project.focusedStackViewer.getLayersOfType(
      CATMAID.TileLayer
    );
    for (let l = 0; l < tileLayers.length; ++l) {
      let tileLayer = tileLayers[l];
      let stackInfo = Object.assign(
        {},
        tileLayer.stack.mirrors[tileLayer.mirrorIndex]
      );
      delete stackInfo.id;
      delete stackInfo.position;
      stackInfo["resolution"] = [
        tileLayer.stack.resolution.x,
        tileLayer.stack.resolution.y,
        tileLayer.stack.resolution.z
      ];
      stackInfo["bounds"] = [
        tileLayer.stack.dimension.x,
        tileLayer.stack.dimension.y,
        tileLayer.stack.dimension.z
      ];
      stackInfo["translation"] = [
        tileLayer.stack.translation.x,
        tileLayer.stack.translation.y,
        tileLayer.stack.translation.z
      ];
      stackInfo["broken_slices"] = tileLayer.stack.broken_slices;
      stackInfo["source_base_url"] = stackInfo["image_base"];
      return stackInfo;
    }
  };

  /**
   * Gather the information for the volume toml
   */
  AutoproofreaderWidget.prototype.getVolume = function() {
    let self = this;
    let setting_values = self.getSettingValues();
    if ("volume_id" in setting_values.run) {
      return CATMAID.fetch(
        "ext/autoproofreader/" + project.id + "/image-volume-configs",
        "GET",
        { volume_config_id: setting_values.run.volume_id }
      ).then(function(e) {
        console.log("getting volume config");
        console.log(e);
        let config;
        if (e[0].name == "default") {
          config = { ImageStack: [self.getImageStackVolume()] };
        } else {
          config = toml.parse(e[0].config);
        }
        console.log(config);
        return config;
      });
    } else {
      throw Error("Volume must be selected!");
    }
  };

  /**
   * Save the volume data in a toml
   */
  AutoproofreaderWidget.prototype.saveVolumes = function() {
    this.saveToml(this.getVolume(), "volumes");
  };

  /*
    --------------------------------------------------------------------------------
    SERVER
    */

  AutoproofreaderWidget.prototype.getServer = function() {
    let server = this.getSettingValues(this.settings.run.server_id);
    return server;
  };

  AutoproofreaderWidget.prototype.refreshServers = function() {
    let self = this;
    CATMAID.fetch(
      "ext/autoproofreader/" + project.id + "/compute-servers",
      "GET"
    ).then(function(e) {
      let options = [];
      e.forEach(function(server) {
        options.push({ name: server[1], id: server[0] });
      });
      self.settings.server.id.options = options;
      self.settings.server.id.value =
        options.length > 0 ? options[0].id : undefined;
      self.createSettings(self.settings.server);
    });
  };

  /*
    --------------------------------------------------------------------------------
    TOML PARSER
    */

  /**
   * Save an object as a toml file
   */
  AutoproofreaderWidget.prototype.saveToml = function(object, name) {
    let filename = name + ".toml";
    if (!filename) return;
    let data = toml.dump(object);
    saveAs(new Blob([data], { type: "text/plain" }), filename);
  };

  AutoproofreaderWidget.prototype.uploadSettingsToml = function(
    files,
    settings
  ) {
    let self = this;
    if (!CATMAID.containsSingleValidFile(files, "toml")) {
      return;
    }

    let reader = new FileReader();
    reader.onload = function(e) {
      let uploaded_settings = toml.parse(reader.result);

      /**
       * This function assumes any setting found in new settings is already
       * a field in old settings. Thus it just overwrites the values in
       * old_settings with the values from new settings
       * @param {*} old_settings
       * @param {*} new_settings
       */
      let update_settings = function(old_settings, new_settings) {
        Object.keys(new_settings).forEach(function(key) {
          // first check if the key is in the old_settings
          if (key in old_settings) {
            // if the key is part of the old settings, check if it
            // is a field that can have its value overwritten
            if ("type" in old_settings[key]) {
              old_settings[key]["value"] = new_settings[key];
            } else {
              // key must be an overarching catagory that contains fields.
              // Thus fill in each of its fields or sub-catagories.
              update_settings(old_settings[key], new_settings[key]);
            }
          } else {
            CATMAID.msg(
              "warn",
              "The settings field " +
                key +
                " has not yet been properly implemented"
            );
          }
        });
      };
      update_settings(settings, uploaded_settings);
      self.createSettings(settings);
    };
    reader.readAsText(files[0]);
  };

  /*
    --------------------------------------------------------------------------------
    DATA VIS
    */
  AutoproofreaderWidget.prototype.display_results_data = function(job) {
    let self = this;
    self.ranking_skeleton_id = job.skeleton;
    self.ranking_result_id = job.id;
    CATMAID.fetch(
      "ext/autoproofreader/" + project.id + "/proofread-tree-nodes",
      "GET",
      { result_id: job.id }
    )
      .then(ranking_data => {
        self.rankingTable.clear();
        ranking_data.forEach(function(node) {
          self.appendOneNode(node);
        });
        self.rankingTable.draw();
      })
      .catch(CATMAID.handleError);
  };

  /*
    --------------------------------------------------------------------------------
    TABLE
    */
  AutoproofreaderWidget.prototype.initTables = function() {
    this.initQueuedTable();
    this.initCompletedTable();
    this.initRankingTable();
    this.get_jobs();
  };

  AutoproofreaderWidget.prototype.initQueuedTable = function() {
    const self = this;
    const tableID = this.idPrefix + "datatable-queued";
    const $table = $("#" + tableID);

    this.ongoingTable = $table.DataTable({
      // http://www.datatables.net/usage/options
      destroy: true,
      dom: '<"H"lrp>t<"F"ip>',
      serverSide: false,
      paging: true,
      orderCellsTop: true,
      lengthChange: true,
      autoWidth: false,
      pageLength: CATMAID.pageLengthOptions[0],
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      jQueryUI: true,
      processing: true,
      deferRender: true,
      columns: [
        {
          orderable: false,
          className: "dt-center cm-center",
          render: function(data, type, row, meta) {
            return '<i class="fa fa-remove fa-fw clickable action-remove" alt="Remove" title="Remove"></i>';
          }
        },
        {
          data: "creation_time",
          render: function(time_string) {
            let start = new Date(time_string);
            let now = new Date();
            return Math.floor((now - start) / (10 * 60 * 60)) / 100;
          },
          orderable: true,
          searchable: true,
          className: "run_time"
        },
        {
          data: "name",
          orderable: true,
          searchable: true,
          className: "name"
        },
        {
          data: "status",
          orderable: true,
          searchable: true,
          className: "status"
        },
        {
          data: "skeleton",
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: "skeletonID"
        }
      ]
    });

    $(`#${tableID} tbody`).on("click", "tr", function() {
      $(this).toggleClass("selected");
    });

    let exactNumSearch = function(event) {
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        // Filter with a regular expression
        const filterValue = event.currentTarget.value;
        const regex = filterValue === "" ? "" : `^${filterValue}$`;

        self.ongoingTable
          .column(event.currentTarget.closest("th"))
          .search(regex, true, false)
          .draw();
      }
    };

    let stringSearch = function(event) {
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
      }
      // Filter with a regular expression
      let filterValue = event.currentTarget.value;
      let regex = filterValue === "" ? "" : `.*${filterValue}.*`;

      self.ongoingTable
        .column(event.currentTarget.closest("th"))
        .search(regex, true, false)
        .draw();
    };

    $(`#${tableID}-search-job-name`).keyup(stringSearch);
    $(`#${tableID}-search-job-status`).keyup(stringSearch);
    $(`#${tableID}-search-model-name`).keyup(stringSearch);

    let $headerInput = $table.find("thead input");

    // prevent sorting the column when focusing on the search field
    $headerInput.click(function(event) {
      event.stopPropagation();
    });

    // remove the 'Search' string when first focusing the search box
    $headerInput.focus(function() {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });
  };

  AutoproofreaderWidget.prototype.initCompletedTable = function() {
    const self = this;
    const tableID = this.idPrefix + "datatable-completed";
    const $table = $("#" + tableID);

    var createCheckbox = function(key, result) {
      var id = `${tableID}-result-${key}-${result.id}`;
      return (
        `<input type="checkbox" class="action-toggle" id="${id}" ` +
        `value="${result.id}" data-action="${key}"` +
        (result[key] ? " checked" : "") +
        " />"
      );
    };

    this.completedTable = $table.DataTable({
      // http://www.datatables.net/usage/options
      destroy: true,
      dom: '<"H"lrp>t<"F"ip>',
      serverSide: false,
      paging: true,
      orderCellsTop: true,
      lengthChange: true,
      autoWidth: false,
      pageLength: CATMAID.pageLengthOptions[0],
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      jQueryUI: true,
      processing: true,
      deferRender: true,
      columns: [
        {
          orderable: false,
          className: "dt-center cm-center",
          render: function(data, type, row, meta) {
            return '<i class="fa fa-remove fa-fw clickable action-remove" alt="Remove" title="Remove"></i>';
          }
        },
        {
          data: "name",
          searchable: true,
          className: "name",
          render: {
            display: function(name) {
              return (
                '<a href="#" class="result-selection-link action-select">' +
                (name ? name : "undefined") +
                "</a>"
              );
            },
            _: function(name) {
              return name ? name : "undefined";
            }
          }
        },
        {
          data: "status",
          searchable: true,
          className: "status"
        },
        {
          data: "skeleton",
          render: Math.floor,
          searchable: true,
          className: "skeletonID"
        },
        {
          orderable: false,
          visible: true,
          render: function(data, type, row, meta) {
            return createCheckbox("private", row);
          }
        },
        {
          orderable: false,
          visible: true,
          render: function(data, type, row, meta) {
            return createCheckbox("permanent", row);
          }
        },
        {
          orderable: false,
          render: function(data, type, row, meta) {
            return (
              '<i class="fa fa-tag fa-fw clickable action-annotate" ' +
              'alt="Annotate" title="Annotate skeleton"></i>'
            );
          }
        }
      ]
    });

    let exactNumSearch = function(event) {
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        // Filter with a regular expression
        const filterValue = event.currentTarget.value;
        const regex = filterValue === "" ? "" : `^${filterValue}$`;

        self.completedTable
          .column(event.currentTarget.closest("th"))
          .search(regex, true, false)
          .draw();
      }
    };

    let stringSearch = function(event) {
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
      }
      // Filter with a regular expression
      let filterValue = event.currentTarget.value;
      let regex = filterValue === "" ? "" : `.*${filterValue}.*`;

      self.completedTable
        .column(event.currentTarget.closest("th"))
        .search(regex, true, false)
        .draw();
    };

    $(`#${tableID}-search-job-name`).keyup(stringSearch);
    $(`#${tableID}-search-job-status`).keyup(stringSearch);
    $(`#${tableID}-search-model-name`).keyup(stringSearch);

    let $headerInput = $table.find("thead input");

    // prevent sorting the column when focusing on the search field
    $headerInput.click(function(event) {
      event.stopPropagation();
    });

    // remove the 'Search' string when first focusing the search box
    $headerInput.focus(function() {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });
  };

  AutoproofreaderWidget.prototype.initRankingTable = function() {
    const self = this;
    const tableID = this.idPrefix + "datatable-rankings";
    const $table = $("#" + tableID);

    this.rankingTable = $table.DataTable({
      // http://www.datatables.net/usage/options
      destroy: true,
      dom: '<"H"lrp>t<"F"ip>',
      serverSide: false,
      paging: false,
      scrollY: 400,
      lengthChange: true,
      autoWidth: false,
      pageLength: CATMAID.pageLengthOptions[0],
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      jQueryUI: true,
      processing: true,
      deferRender: true,
      columns: [
        {
          data: "node_id",
          orderable: true,
          searchable: true,
          className: "node_id"
        },
        {
          data: "parent_id",
          orderable: true,
          searchable: true,
          className: "parent_id"
        },
        {
          data: "connectivity_score",
          orderable: true,
          searchable: true,
          className: "connectivity_score"
        },
        {
          data: "branch_score",
          orderable: true,
          searchable: true,
          className: "branch_score"
        },
        {
          data: "reviewed",
          orderable: true,
          searchable: true,
          className: "reviewed"
        }
      ]
    });

    $(`#${tableID} tbody`).on("click", "td", function() {
      let index = self.rankingTable.cell(this).index();
      console.log(index);
      let row_data = self.rankingTable.row(index.row).data();
      if (!self.selected_points.has(row_data.node_id)) {
        self.selected_points.add(row_data.node_id);
      } else {
        self.selected_points.delete(row_data.node_id);
      }
      SkeletonAnnotations.staticMoveTo(
        parseInt(row_data.z),
        parseInt(row_data.y),
        parseInt(row_data.x)
      );
      self.updateProofreadSkeletonVisualizationLayer;

      /* CODE FOR ADDING NODE
            .then(e => {
                var projectCoordinates = project.focusedStackViewer.projectCoordinates();
                var parameters = {
                    x: projectCoordinates.x,
                    y: projectCoordinates.y,
                    z: projectCoordinates.z,
                };
                parameters['skeleton_id'] = self.ranking_skeleton_id;
                CATMAID.fetch(project.id + '/node/nearest', 'POST', parameters)
                    .then(function (data) {
                        SkeletonAnnotations.staticSelectNode(data.treenode_id);
                        return data.treenode_id;
                    })
                    .catch(function (e) {
                        CATMAID.warn(
                            'Going to skeleton ' + data.skeleton_id + ' failed due to: ' + e
                        );
                    })
                    .then(function (pid) {
                        let data = self.rankingTable.row(index.row).data();
                        let stack_viewer = project.getStackViewer(1);
                        let tracing_layers = stack_viewer.getLayersOfType(
                            CATMAID.TracingLayer
                        );
                        let tracing_layer = tracing_layers[0];
                        tracing_layer.tracingOverlay.createNode(
                            pid,
                            null,
                            data.x + data.branch_dx,
                            data.y + data.branch_dy,
                            data.z + data.branch_dz,
                            -1,
                            0,
                            null
                        );
                    })
                    .catch(function (e) {
                        console.log(e);
                        CATMAID.warn('Failed to create node!');
                    });
            });
            */
    });

    let exactNumSearch = function(event) {
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        // Filter with a regular expression
        const filterValue = event.currentTarget.value;
        const regex = filterValue === "" ? "" : `^${filterValue}$`;

        self.rankingTable
          .column(event.currentTarget.closest("th"))
          .search(regex, true, false)
          .draw();
      }
    };

    let $headerInput = $table.find("thead input");

    // prevent sorting the column when focusing on the search field
    $headerInput.click(function(event) {
      event.stopPropagation();
    });

    // remove the 'Search' string when first focusing the search box
    $headerInput.focus(function() {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });

    this.ranking;
  };

  AutoproofreaderWidget.prototype.get_jobs = function() {
    this.ongoingTable.clear();
    this.completedTable.clear();
    let self = this;
    CATMAID.fetch(
      "ext/autoproofreader/" + project.id + "/autoproofreader-results",
      "GET"
    )
      .then(function(results) {
        results.forEach(function(result) {
          self.appendOneJob(result);
        });
        self.ongoingTable.draw();
        self.completedTable.draw();
      })
      .catch(CATMAID.handleError);
  };

  AutoproofreaderWidget.prototype.appendOneJob = function(job) {
    let self = this;
    let row = {
      completion_time: job.completion_time,
      config: job.config,
      creation_time: job.creation_time,
      data: job.data,
      edition_time: job.edition_time,
      errors: job.errors,
      id: job.id,
      model: job.model,
      name: job.name,
      permanent: job.permanent,
      private: job.private,
      project: job.project,
      skeleton: job.skeleton,
      skeleton_csv: job.skeleton_csv,
      status: job.status,
      user: job.user,
      volume: job.volume
    };
    if (job.status === "complete") {
      self.completedTable.rows.add([row]);
      self.completedTable.draw();
    } else {
      self.ongoingTable.rows.add([row]);
      self.ongoingTable.draw();
    }
  };

  AutoproofreaderWidget.prototype.appendOneNode = function(node) {
    let self = this;
    let row = {
      node_id: node.node_id,
      parent_id: node.parent_id,
      connectivity_score: node.connectivity_score,
      branch_score: node.branch_score,
      reviewed: node.reviewed,
      x: node.x,
      y: node.y,
      z: node.z,
      branch_dx: node.branch_dx,
      branch_dy: node.branch_dy,
      branch_dz: node.branch_dz
    };
    self.rankingTable.rows.add([row]);
    self.rankingTable.draw();
  };

  AutoproofreaderWidget.prototype.clear = function() {
    this.oTable.clear();
    this.oTable.draw();
  };

  AutoproofreaderWidget.prototype.update = function() {
    this.oTable.draw();
  };

  /*
    --------------------------------------------------------------------------------
    SETTINGS
    This section contains the settings
    */

  AutoproofreaderWidget.prototype.initSettings = function() {
    this.createDefaultSettings();

    this.createSettings();
  };

  AutoproofreaderWidget.prototype.createSettings = function() {
    let self = this;

    let is_visible = function(settings, setting, visible) {
      let is_container = !("type" in settings);
      if (visible == true) {
        // if a root in settings tree is visible, all children are visible
        // only exception is advanced settings
        return (
          true &
          (is_container ||
            !settings.advanced ||
            settings.advanced == self.settings.run.advanced.value)
        );
      }
      if (visible == false) {
        return false;
      }

      if (!is_container) {
        return true;
      }
      if (is_container && ["sarbor", "run"].includes(setting)) {
        return true;
      }

      if (
        is_container &&
        self.settings.run.segmentation_type.value === setting
      ) {
        return true;
      }

      return false;
    };

    let createNumericInputSpinner = function(args) {
      let input = CATMAID.DOM.createInputSetting(
        args.name,
        args.value,
        args.helptext
      );

      $(input)
        .find("input")
        .spinner({
          min: args.min,
          max: args.max,
          step: args.step,
          change: args.change,
          stop: args.change
        });

      return input;
    };

    let createOptionDropdown = function(args) {
      let dropdown = $("<select/>");
      args.options.forEach(function(o) {
        this.append(new Option(o.name, o.id));
      }, dropdown);
      dropdown.val(args.value);

      dropdown.on("change", args.change);

      return CATMAID.DOM.createLabeledControl(
        args.name,
        dropdown,
        args.helptext
      );
    };

    let createAsyncOptionDropdown = function(args) {
      var async_placeholder = $(
        CATMAID.DOM.createLabeledAsyncPlaceholder(
          args.name,
          args.async_init(args.async_change),
          args.helptext
        )
      );

      let addbutton = $('<button class="add" />')
        .button({
          icons: {
            primary: "ui-icon-plus"
          },
          text: false
        })
        .click(function() {
          args.async_add();
        });

      let removebutton = $('<button class="remove" />')
        .button({
          icons: {
            primary: "ui-icon-minus"
          },
          text: false
        })
        .click(function() {
          args.async_remove();
        });

      async_placeholder.find("div.help").before(addbutton);
      async_placeholder.find("div.help").before(removebutton);

      /**
       * This function is necessary for refreshing the list when
       * adding or removing servers.
       *
       * This parameter must be re-passed since it is a promise
       * and the original one has already resolved and thus will
       * not provide the refreshed results.
       */
      async_placeholder[0].rebuild = function() {
        return createAsyncOptionDropdown(args);
      };

      return async_placeholder;
    };

    let createNumberListInput = function(args) {
      return CATMAID.DOM.createInputSetting(
        args.name,
        args.value.join(", "),
        args.helptext,
        args.change
      );
    };

    let createStringInput = function(args) {
      return CATMAID.DOM.createInputSetting(
        args.name,
        args.value,
        args.helptext,
        args.change
      );
    };

    let createCheckbox = function(args) {
      return CATMAID.DOM.createCheckboxSetting(
        args.name,
        args.value,
        args.helptext,
        args.change
      );
    };

    let renderSetting = function(container, setting) {
      let newOption = [];
      if (setting.type === "option_dropdown") {
        newOption.push(createOptionDropdown(setting));
      } else if (setting.type === "async_option_dropdown") {
        newOption.push(createAsyncOptionDropdown(setting));
      } else if (setting.type === "numeric_spinner_int") {
        newOption.push(createNumericInputSpinner(setting));
      } else if (setting.type === "numeric_spinner_float") {
        newOption.push(createNumericInputSpinner(setting));
      } else if (setting.type === "number_list") {
        newOption.push(createNumberListInput(setting));
      } else if (setting.type === "string") {
        newOption.push(createStringInput(setting));
      } else if (setting.type === "checkbox") {
        newOption.push(createCheckbox(setting));
      } else {
        CATMAID.msg("warn", "unknown setting type " + setting.type);
      }
      newOption.forEach(function(item) {
        item[0].id = setting.label;
        container.append(item);
      });
    };

    let createSection = function(container, key, values, collapsed) {
      let section = CATMAID.DOM.addSettingsContainer(
        container,
        key + " settings",
        collapsed
      );
      section.id = key;
      let depth = section.parents("div.settings-container").length;

      var fileButton = CATMAID.DOM.createFileButton(undefined, false, function(
        evt
      ) {
        self.uploadSettingsToml(evt.target.files, values);
      });

      let uploadbutton = $('<button class="uploadSettingsFile" />')
        .button({
          icons: {
            primary: "ui-icon-arrowthick-1-n"
          },
          text: false
        })
        .click(function() {
          fileButton.click();
        });
      uploadbutton.css("position", "absolute");
      uploadbutton.css("right", depth + "em");
      uploadbutton.css("margin", "-1.6em 0 0 0");

      let downloadbutton = $('<button class="downloadSettingsFile" />')
        .button({
          icons: {
            primary: "ui-icon-arrowthick-1-s"
          },
          text: false
        })
        .click(function() {
          self.saveToml(self.getSettingValues(values), key);
        });
      downloadbutton.css("position", "absolute");
      downloadbutton.css("right", depth + 3 + "em");
      downloadbutton.css("margin", "-1.6em 0 0 0");

      section.parent().width("100%");
      $("p:first", section.parent()).after(uploadbutton);
      section.parent().width("100%");
      $("p:first", section.parent()).after(downloadbutton);

      return section;
    };

    let renderSettings = function(container, settings, visible) {
      for (let setting in settings) {
        if (is_visible(settings[setting], setting, visible)) {
          if (!("type" in settings[setting])) {
            let ds = createSection(container, setting, settings[setting], true);
            renderSettings(ds, settings[setting], true);
          } else {
            renderSetting(container, settings[setting]);
          }
        }
      }
    };

    let refresh = function() {
      // get the settings page and clear it
      let space = $("#content-wrapper > #settings");
      space.width("100%");
      space.css("margin", "0em .5em .5em .5em");
      $(space).empty();

      // Add all settings
      renderSettings(space, this.settings, null);

      // Add collapsing support to all settings containers
      $("p.title", space).click(function() {
        let section = this;
        $(section)
          .next()
          .next()
          .next(".content")
          .animate(
            {
              height: "toggle",
              opacity: "toggle"
            },
            {
              complete: function() {
                // change open/close indicator box
                let open_elements = $(".extend-box-open", section);
                if (open_elements.length > 0) {
                  open_elements.attr("class", "extend-box-closed");
                } else {
                  $(".extend-box-closed", section).attr(
                    "class",
                    "extend-box-open"
                  );
                }
              }
            }
          );
      });
    }.bind(this);

    refresh();
  };

  AutoproofreaderWidget.prototype.getSettingValues = function(
    settings,
    setting_values
  ) {
    setting_values = setting_values || {};
    settings = settings || this.settings;
    let keys = Object.keys(settings);
    if ("value" in settings) {
      return settings.value;
    }
    if (keys.length > 0) {
      for (let key of keys) {
        if (key) {
          if ("type" in settings[key]) {
            if (
              this.supported_fields.includes(settings[key]["type"]) &&
              "value" in settings[key]
            ) {
              setting_values[key] = settings[key]["value"];
            }
          } else if (Object.keys(settings[key]).length > 0) {
            setting_values[key] = this.getSettingValues(
              settings[key],
              setting_values[key]
            );
          }
        }
      }
    }
    return setting_values;
  };

  AutoproofreaderWidget.prototype.createDefaultSettings = function() {
    /**
     * Adds necessary information for a new setting into the
     * default settings variable. This will later be used
     * to populate the settings page automatically.
     * @param {*} args
     */

    let self = this;

    let addSettingTemplate = function(args) {
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
        reset: args.reset,
        advanced: Boolean(args.advanced),
        change: getChangeFunc(args.type, args.settings, args.label, args.reset)
      };
      args.settings[args.label] = fields;
    };

    let getChangeFunc = function(type, settings, label, reset) {
      if (type === "numeric_spinner_float") {
        self.supported_fields.push("numeric_spinner_float");
        return function() {
          let newValue = parseFloat(this.value);
          settings[label].value = newValue;
          if (reset) {
            self.createSettings();
          }
        };
      } else if (type === "numeric_spinner_int") {
        self.supported_fields.push("numeric_spinner_int");
        return function() {
          let newValue = parseFloat(this.value, 10);
          settings[label].value = newValue;
          if (reset) {
            self.createSettings();
          }
        };
      } else if (type === "option_dropdown") {
        self.supported_fields.push("option_dropdown");
        return function() {
          let newValue = this.value;
          settings[label].value = newValue;
          console.log(self.settings);
          if (reset) {
            self.createSettings();
          }
        };
      } else if (type === "async_option_dropdown") {
        self.supported_fields.push("async_option_dropdown");
        return function() {};
      } else if (type === "checkbox") {
        self.supported_fields.push("checkbox");
        return function() {
          let newValue = this.checked;
          settings[label].value = newValue;
          if (reset) {
            self.createSettings();
          }
        };
      } else if (type === "number_list") {
        self.supported_fields.push("number_list");
        return function() {
          let newValue = this.value
            .split(",")
            .map(CATMAID.tools.trimString)
            .map(Number);
          settings[label].value = newValue;
          if (reset) {
            self.createSettings();
          }
        };
      } else if (type === "string") {
        self.supported_fields.push("string");
        return function() {
          let newValue = this.value;
          settings[label].value = newValue;
          if (reset) {
            self.createSettings();
          }
        };
      }
    };

    let getSubSettings = function(settings, setting) {
      settings[setting] = {};
      return settings[setting];
    };

    let createWatershedDefaults = function(settings) {
      let sub_settings = getSubSettings(settings, "watershed");
    };

    let createDiluvianDefaults = function(settings) {
      let sub_settings = getSubSettings(settings, "diluvian");

      addSettingTemplate({
        settings: sub_settings,
        type: "numeric_spinner_int",
        label: "seed",
        name: "Seed",
        helptext: "The seed to be used for all random number generators.",
        value: 1,
        min: 0,
        step: 1
      });

      addSettingTemplate({
        settings: sub_settings,
        type: "number_list",
        label: "input_resolution",
        name: "Input resolution",
        helptext:
          "The resolution of the segmenting network input. " +
          "The highest possible resolution is the resolution of the " +
          "image stack since upsampling is not supported. You may downsample " +
          "by an arbitrary number of factors of 2 on each axis.",
        value: [
          self.getImageStackVolume().resolution[2],
          self.getImageStackVolume().resolution[1],
          self.getImageStackVolume().resolution[0]
        ]
      });
    };

    let change_volume = function(volume_id) {
      console.log(
        `changing volume from ${
          self.settings.run.volume_id.value
        } to ${volume_id}`
      );
      self.settings.run.volume_id.value = volume_id;
    };

    let initVolumeList = function(change_func) {
      return CATMAID.fetch(
        "ext/autoproofreader/" + project.id + "/image-volume-configs",
        "GET"
      ).then(function(json) {
        var volumes = json
          .sort(function(a, b) {
            return CATMAID.tools.compareStrings(a.name, b.name);
          })
          .map(function(volume) {
            return {
              title: volume.name + " (#" + volume.id + ")",
              value: volume.id
            };
          });
        var selectedVolumeId = self.settings.run.volume_id.value;
        // Create actual element based on the returned data
        var node = CATMAID.DOM.createRadioSelect(
          "Volumes",
          volumes,
          selectedVolumeId,
          true
        );
        // Add a selection handler
        node.onchange = function(e) {
          let volumeId = null;
          if (e.srcElement.value !== "none") {
            volumeId = parseInt(e.srcElement.value, 10);
          }
          change_func(volumeId);
        };

        return node;
      });
    };

    function add_volume() {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog("Add Volume");

      dialog.appendMessage("Please provide the necessary information:");
      let volume_name = dialog.appendField("Volume name: ", "volume_name", "");

      let config;
      var fileButton = CATMAID.DOM.createFileButton(undefined, false, function(
        evt
      ) {
        let reader = new FileReader();
        reader.onload = function(e) {
          config = reader.result;
        };
        reader.readAsText(evt.target.files[0]);
      });
      let configbutton = $('<button class="uploadSettingsFile" />')
        .button({
          icons: {
            primary: "ui-icon-arrowthick-1-n"
          },
          text: false
        })
        .click(function() {
          fileButton.click();
        });
      dialog.appendChild(configbutton[0]);

      // Add handler for creating the server
      dialog.onOK = function() {
        return CATMAID.fetch(
          "ext/autoproofreader/" + project.id + "/image-volume-configs",
          "PUT",
          {
            name: volume_name.value,
            config: config
          }
        )
          .then(function(e) {
            // refresh the server list
            let replacement = $("#volume_id")[0].rebuild();
            $("#volume_id").empty();
            $("#volume_id").append(replacement);
          })
          .catch(CATMAID.handleError);
      };

      dialog.show(500, "auto", true);
    }

    function remove_volume() {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog("Remove Volume");

      dialog.appendMessage("Please select a volume:");
      let volume = self.settings.run.volume_id.value;
      let change_func = function(volume_id) {
        volume = volume_id;
      };
      dialog.appendChild(
        CATMAID.DOM.createLabeledAsyncPlaceholder(
          "Compute volume",
          initVolumeList(change_func),
          "The volume to remove."
        )
      );

      // Add handler for creating the server
      dialog.onOK = function() {
        CATMAID.fetch(
          "ext/autoproofreader/" + project.id + "/image-volume-configs",
          "DELETE",
          { volume_config_id: volume }
        )
          .then(function(e) {
            // refresh the server list
            let replacement = $("#volume_id")[0].rebuild();
            $("#volume_id").empty();
            $("#volume_id").append(replacement);
          })
          .catch(CATMAID.handleError);
      };

      dialog.show(500, "auto", true);
    }

    let change_server = function(server_id) {
      console.log(
        `changing server from ${
          self.settings.run.server_id.value
        }to ${server_id}`
      );
      self.settings.run.server_id.value = server_id;
      let model_id = self.settings.run.model_id.value;
      if (model_id !== undefined) {
        CATMAID.fetch(
          "ext/autoproofreader/" + project.id + "/diluvian-models",
          "GET",
          { model_id: model_id }
        ).then(function(result) {
          let model = result[0];
          if (model.server !== server_id) {
            CATMAID.msg(
              "warn",
              "Server does not match the server the selected " +
                "Model was trained on. Make sure the server specific " +
                "parameters on the model are correct."
            );
          }
        });
      }
    };

    let initServerList = function(change_func) {
      return CATMAID.fetch(
        "ext/autoproofreader/" + project.id + "/compute-servers",
        "GET"
      ).then(function(json) {
        var servers = json
          .sort(function(a, b) {
            return CATMAID.tools.compareStrings(a.name, b.name);
          })
          .map(function(server) {
            return {
              title: server.name + " (#" + server.id + ")",
              value: server.id
            };
          });
        var selectedServerId = self.settings.run.server_id.value;
        // Create actual element based on the returned data
        var node = CATMAID.DOM.createRadioSelect(
          "Servers",
          servers,
          selectedServerId,
          true
        );
        // Add a selection handler
        node.onchange = function(e) {
          let serverId = null;
          if (e.srcElement.value !== "none") {
            serverId = parseInt(e.srcElement.value, 10);
          }
          change_func(serverId);
        };

        return node;
      });
    };

    function add_server() {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog("Add Server");

      dialog.appendMessage("Please provide the necessary information:");
      let server_name = dialog.appendField("Server name: ", "server_name", "");
      let server_address = dialog.appendField(
        "Server address: ",
        "server_address",
        "janelia.int.org"
      );

      let environment_source_path = dialog.appendField(
        "Source path for segmenting environment (optional but recommended): ",
        "env_source_path",
        ""
      );
      let diluvian_path = dialog.appendField(
        "Path to the diluvian directory: ",
        "diluvian_path",
        "~/diluvian"
      );
      let results_directory = dialog.appendField(
        "Path to the results directory in diluvian: ",
        "results_directory",
        "results"
      );

      // Add handler for creating the server
      dialog.onOK = function() {
        return CATMAID.fetch(
          "ext/autoproofreader/" + project.id + "/compute-servers",
          "PUT",
          {
            name: server_name.value,
            address: server_address.value,
            environment_source_path: environment_source_path.value,
            diluvian_path: diluvian_path.value,
            results_directory: results_directory.value
          }
        )
          .then(function(e) {
            // refresh the server list
            let replacement = $("#server_id")[0].rebuild();
            $("#server_id").empty();
            $("#server_id").append(replacement);
          })
          .catch(CATMAID.handleError);
      };

      dialog.show(500, "auto", true);
    }

    function remove_server() {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog("Remove Server");

      dialog.appendMessage("Please select a server:");
      let server = self.settings.run.server_id.value;
      let change_func = function(server_id) {
        server = server_id;
      };
      dialog.appendChild(
        CATMAID.DOM.createLabeledAsyncPlaceholder(
          "Compute server",
          initServerList(change_func),
          "The server to remove."
        )
      );

      // Add handler for creating the server
      dialog.onOK = function() {
        CATMAID.fetch(
          "ext/autoproofreader/" + project.id + "/compute-servers",
          "DELETE",
          { server_id: server }
        )
          .then(function(e) {
            // refresh the server list
            let replacement = $("#server_id")[0].rebuild();
            $("#server_id").empty();
            $("#server_id").append(replacement);
          })
          .catch(CATMAID.handleError);
      };

      dialog.show(500, "auto", true);
    }

    let change_model = function(model_id) {
      console.log(
        `changing model from ${self.settings.run.model_id.value} to ${model_id}`
      );
      self.settings.run.model_id.value = model_id;
      let server_id = self.settings.run.server_id.value;
      CATMAID.fetch(
        "ext/autoproofreader/" + project.id + "/diluvian-models",
        "GET",
        { model_id: model_id }
      ).then(function(result) {
        let model = result[0];

        if (server_id !== undefined) {
          if (model.server !== server_id) {
            CATMAID.msg(
              "warn",
              "Server does not match the server the selected " +
                "Model was trained on. Make sure the server specific " +
                "parameters on the model are correct."
            );
          }
        } else {
          self.settings.run.server_id.value = model.server_id;
          // refresh the server list
          let replacement = $("#server_id")[0].rebuild();
          $("#server_id").empty();
          $("#server_id").append(replacement);
        }
      });
    };

    let initModelList = function(change_func) {
      return CATMAID.fetch(
        "ext/autoproofreader/" + project.id + "/diluvian-models",
        "GET"
      ).then(function(json) {
        var models = json
          .sort(function(a, b) {
            return CATMAID.tools.compareStrings(a.name, b.name);
          })
          .map(function(model) {
            return {
              title: model.name + " (#" + model.id + ")",
              value: model.id
            };
          });
        var selectedModelId = self.settings.run.model_id.value;
        // Create actual element based on the returned data
        var node = CATMAID.DOM.createRadioSelect(
          "Models",
          models,
          selectedModelId,
          true
        );
        // Add a selection handler
        node.onchange = function(e) {
          let modelId = null;
          if (e.srcElement.value !== "none") {
            modelId = parseInt(e.srcElement.value, 10);
          }
          change_func(modelId);
        };

        return node;
      });
    };

    function add_model() {
      // Add skeleton source message and controls
      let dialog = new CATMAID.OptionsDialog("WIP");
      dialog.appendMessage("Please provide the necessary information:");
      let model_name = dialog.appendField("Model name: ", "model_name", "");
      let server = self.settings.run.server_id.value;
      let change_func = function(server_id) {
        server = server_id;
      };
      dialog.appendChild(
        CATMAID.DOM.createLabeledAsyncPlaceholder(
          "Compute server",
          initServerList(change_func),
          "The server to remove."
        )
      );
      let model_source_path = dialog.appendField(
        "Path to the models weights: ",
        "model_path",
        "trained_models/model.hdf5"
      );
      let config;
      var fileButton = CATMAID.DOM.createFileButton(undefined, false, function(
        evt
      ) {
        let reader = new FileReader();
        reader.onload = function(e) {
          config = reader.result;
        };
        reader.readAsText(evt.target.files[0]);
      });
      let configbutton = $('<button class="uploadSettingsFile" />')
        .button({
          icons: {
            primary: "ui-icon-arrowthick-1-n"
          },
          text: false
        })
        .click(function() {
          fileButton.click();
        });
      dialog.appendChild(configbutton[0]);

      // Add handler for creating the model
      dialog.onOK = function() {
        CATMAID.fetch(
          "ext/autoproofreader/" + project.id + "/diluvian-models",
          "PUT",
          {
            name: model_name.value,
            server_id: server,
            model_source_path: model_source_path.value,
            config: config
          }
        )
          .then(function(e) {
            console.log(e);
            // refresh the server list
            let replacement = $("#model_id")[0].rebuild();
            $("#model_id").empty();
            $("#model_id").append(replacement);
          })
          .catch(CATMAID.handleError);
      };

      dialog.show(500, "auto", true);
    }

    function remove_model() {
      // Remove a model
      let dialog = new CATMAID.OptionsDialog("Remove Model");

      dialog.appendMessage("Please select a model:");
      let model = self.settings.run.model_id.value;
      let change_func = function(model_id) {
        model = model_id;
      };
      dialog.appendChild(
        CATMAID.DOM.createLabeledAsyncPlaceholder(
          "Diluvian Model",
          initModelList(change_func),
          "The model to remove."
        )
      );

      // Add handler for removing the model
      dialog.onOK = function() {
        CATMAID.fetch(
          "ext/autoproofreader/" + project.id + "/diluvian-models",
          "DELETE",
          { model_id: model }
        )
          .then(function(e) {
            // refresh the server list
            let replacement = $("#model_id")[0].rebuild();
            $("#model_id").empty();
            $("#model_id").append(replacement);
          })
          .catch(CATMAID.handleError);
      };

      dialog.show(500, "auto", true);
    }

    /**
     * These settings control everything to do with running the
     * job on a server. Making sure the server has access to the
     * volumes/models/segmentation_algorithms you want
     * @param {*} settings
     */
    let createRunDefaults = function(settings) {
      let sub_settings = getSubSettings(settings, "run");

      addSettingTemplate({
        settings: sub_settings,
        type: "checkbox",
        label: "advanced",
        name: "Advanced",
        value: false,
        reset: true,
        helptext: "Show advanced settings."
      });

      addSettingTemplate({
        settings: sub_settings,
        type: "string",
        label: "job_name",
        name: "Job name",
        value: "",
        helptext:
          "A name for the job so that it can bse easily found " +
          "later. If left blank the default will be a " +
          "combination of the skeleton id and the date."
      });

      addSettingTemplate({
        settings: sub_settings,
        type: "option_dropdown",
        label: "segmentation_type",
        name: "Segmentation type",
        options: [
          { name: "Diluvian", id: "diluvian" },
          { name: "watershed segmentation", id: "watershed" }
        ],
        helptext:
          "Type of segmentation to use in the backend. Diluvian " +
          "will segment the skeleton on demand which will take some time. " +
          "watershed segmentation is cached and only needs to be retrieved, which " +
          "will be faster but you have less options for customizing the job.",
        reset: true
      });

      addSettingTemplate({
        settings: sub_settings,
        type: "async_option_dropdown",
        label: "volume_id",
        name: "Image source",
        async_init: initVolumeList,
        async_change: change_volume,
        async_add: add_volume,
        async_remove: remove_volume,
        helptext: "The volume to use for segmenting"
      });

      addSettingTemplate({
        settings: sub_settings,
        type: "async_option_dropdown",
        label: "model_id",
        name: "Segmenting model",
        async_init: initModelList,
        async_change: change_model,
        async_add: add_model,
        async_remove: remove_model,
        helptext: "The pretrained model to use for segmenting"
      });

      addSettingTemplate({
        settings: sub_settings,
        type: "async_option_dropdown",
        label: "server_id",
        name: "Compute server",
        async_init: initServerList,
        async_change: change_server,
        async_add: add_server,
        async_remove: remove_server,
        helptext: "The compute server to use for segmenting"
      });

      addSettingTemplate({
        settings: sub_settings,
        type: "numeric_spinner_int",
        label: "skeleton_id",
        name: "Skeleton id",
        helptext: "The id of the skeleton to be used for segmenting",
        value: 1,
        min: 0,
        step: 1
      });

      addSettingTemplate({
        settings: sub_settings,
        type: "number_list",
        label: "gpus",
        name: "GPUs",
        helptext:
          "Which gpus to use for segmenting. " +
          "Leave blank to use all available gpus." +
          "If you want to run multiple jobs simultaneously, " +
          "you will have to choose which gpus to use for each job.",
        value: []
      });
    };

    /**
     * These settings control everything to do skeleton configuration.
     * Whether to downsample, use strahler indicies, etc. etc.
     * @param {*} settings
     */
    let createSarborDefaults = function(settings) {
      let sub_settings = getSubSettings(settings, "sarbor");

      let skeleton_settings = getSubSettings(sub_settings, "skeleton");

      addSettingTemplate({
        settings: skeleton_settings,
        type: "checkbox",
        label: "resample",
        name: "Resample",
        value: true,
        helptext:
          "Whether or not you want to resample the skeleton at " +
          "regular intervals. This is highly recommended for segmenting."
      });

      addSettingTemplate({
        settings: skeleton_settings,
        type: "option_dropdown",
        label: "smoothing",
        name: "Smoothing",
        options: [
          { name: "None", id: "none" },
          { name: "Gaussian", id: "gaussian" }
        ],
        helptext:
          "Type of smoothing to apply to skeleton when resampling points.",
        value: "none"
      });

      addSettingTemplate({
        settings: skeleton_settings,
        type: "numeric_spinner_int",
        label: "resample_delta",
        name: "Resampling delta",
        helptext:
          "The distance d to use when downsampling a skeleton. " +
          "Each sample node will be seperated from neighbors by between " +
          "d/2 and 3d/2 nanometers.",
        value: 1000,
        min: 0,
        step: 1
      });

      addSettingTemplate({
        settings: skeleton_settings,
        type: "checkbox",
        label: "filter_by_strahler",
        name: "Filter by strahler index",
        value: true,
        helptext:
          "Whether or not you want to filter out sections of the skeleton " +
          "based on the strahler index."
      });

      addSettingTemplate({
        settings: skeleton_settings,
        type: "numeric_spinner_int",
        label: "strahler_filter_min",
        name: "Strahler filter minimum",
        helptext: "The minimum strahler index to perform segmenting on.",
        value: 0,
        min: 0,
        step: 1
      });

      let segmentation_settings = getSubSettings(sub_settings, "segmentations");

      addSettingTemplate({
        settings: segmentation_settings,
        type: "checkbox",
        label: "use_sphere",
        name: "Use Sphere",
        helptext:
          "Whether to use the full field of view, shrink it to a spherical field of view." +
          "Using the sphere means losing some data, but not using it means weighting the missing branch " +
          "score in the corners of each field of view due to the distance weighting.",
        advanced: true,
        value: true
      });

      let res = project.focusedStackViewer.primaryStack.resolution;
      addSettingTemplate({
        settings: segmentation_settings,
        type: "number_list",
        label: "resolution_phys",
        name: "Resolution",
        helptext: "Resolution of each voxel.",
        value: [res.x, res.y, res.z]
      });

      addSettingTemplate({
        settings: segmentation_settings,
        type: "number_list",
        label: "start_phys",
        name: "Start",
        helptext: "The minimum physical coordinate along each axis.",
        advanced: true,
        value: [
          project.focusedStackViewer.primaryStack.translation.x,
          project.focusedStackViewer.primaryStack.translation.y,
          project.focusedStackViewer.primaryStack.translation.z
        ]
      });

      addSettingTemplate({
        settings: segmentation_settings,
        type: "number_list",
        label: "shape_phys",
        name: "Shape",
        helptext: "The size of the volume to consider.",
        advanced: true,
        value: [
          res.x * project.focusedStackViewer.primaryStack.dimension.x,
          res.y * project.focusedStackViewer.primaryStack.dimension.y,
          res.z * project.focusedStackViewer.primaryStack.dimension.z
        ]
      });

      addSettingTemplate({
        settings: segmentation_settings,
        type: "number_list",
        label: "downsample",
        name: "Downsample",
        helptext:
          "How much to downsample the segmentations on each axis. " +
          "Full resolution is often not necessary for finding high order branches " +
          "so you can downsample to save memory if you like. The default takes makes " +
          "volume isotropic.",
        value: [
          Math.max(res.x, res.y, res.z) / res.x,
          Math.max(res.x, res.y, res.z) / res.y,
          Math.max(res.x, res.y, res.z) / res.z
        ]
      });

      addSettingTemplate({
        settings: segmentation_settings,
        type: "number_list",
        label: "leaf_shape_voxels",
        name: "Block Shape",
        helptext:
          "The shape of each each block in the blockwise sparse datastructures. " +
          "This includes an in-memory Octree and the n5 filesystem for data storage.",
        advanced: true,
        value: [64, 64, 64]
      });

      addSettingTemplate({
        settings: segmentation_settings,
        type: "number_list",
        label: "fov_shape",
        name: "Field of view shape",
        helptext:
          "The field of view in nanometers around each node that you would " +
          "like to consider when looking for missing branches.",
        value: [3000, 3000, 3000]
      });

      addSettingTemplate({
        settings: segmentation_settings,
        type: "numeric_spinner_float",
        label: "incr_denom",
        name: "Increment Denominator",
        helptext:
          "The amount to increment the denominator when calculating segmentation confidence " +
          "from (# of times segmented) / (# of times seen). Some segmentation algorithms are sensitive " +
          "to initial conditions or have some stocastisity so this term aims to balance areas of the " +
          "segmentation with a high distance weight with those that have a high consensus weight " +
          "incrementing the denominator more gives more weight to areas with more field of view overlap.",
        advanced: true,
        value: 0.5
      });

      addSettingTemplate({
        settings: segmentation_settings,
        type: "numeric_spinner_int",
        label: "interpolate_distance_nodes",
        name: "Interpolate Distance Nodes",
        helptext:
          "Whether to use the full field of view, shrink it to a spherical field of view." +
          "Using the sphere means losing some data, but not using it means weighting the missing branch " +
          "score in the corners of each field of view due to the distance weighting.",
        advanced: true,
        value: 1
      });
    };

    let createDefaults = function(settings) {
      // Add all settings
      createRunDefaults(settings);
      createSarborDefaults(settings);
      createDiluvianDefaults(settings);
      createWatershedDefaults(settings);
    };

    createDefaults(this.settings);
  };

  /*
    --------------------------------------------------------------------------------
    LAYERS
    */
  AutoproofreaderWidget.prototype.updateProofreadSkeletonVisualizationLayer = function(
    focused_connection
  ) {
    var options = {
      visible: this.visibleProofreadLayer,
      result_id: this.ranking_result_id,
      selected_points: this.selected_points,
      focused_connection: focused_connection
    };
    // Create a skeleton projection layer for all stack viewers that
    // don't have one already.
    project.getStackViewers().forEach(function(sv) {
      var layer = sv.getLayer("proofread skeleton projection");
      if (options.visible) {
        if (!layer) {
          // Create new if not already present
          layer = new CATMAID.ProofreadSkeletonVisualizationLayer(sv, options);
          sv.addLayer("proofread skeleton projection", layer);
        }

        // Update other options and display
        layer.updateOptions(options, false, true);
      } else if (layer) {
        sv.removeLayer("proofread skeleton projection");
        sv.redraw();
      }
    });
  };

  AutoproofreaderWidget.prototype.getProofreaderSegmentationLayerOptions = function() {
    let self = this;
    return CATMAID.fetch(
      `ext/autoproofreader/${project.id}/autoproofreader-results`,
      "GET",
      { result_id: self.ranking_result_id }
    ).then(result => {
      return CATMAID.fetch(
        `ext/autoproofreader/${project.id}/autoproofreader-results`,
        "GET",
        { result_id: self.ranking_result_id, uuid: true }
      ).then(uuid => {
        let relative_url = `files/proofreading_segmentations/${uuid}/segmentations.n5/confidence`;
        return CATMAID.fetch(`${relative_url}/attributes.json`, "GET").then(
          attrs_file => {
          var options = {
            visible: self.visibleSegmentationLayer,
            result_id: self.ranking_result_id,
            selected_points: self.selected_points,
            stack_attrs: {
              dimensions: {
                x: attrs_file.dimensions[0],
                y: attrs_file.dimensions[1],
                z: attrs_file.dimensions[2]
              },
              scales: [{ x: 1, y: 1, z: 1 }],
              resolution: { x: 40, y: 40, z: 40 },
              tile_width: attrs_file.blockSize[0],
              tile_height: attrs_file.blockSize[1],
              blockSizeZ: attrs_file.blockSize[2],
              blockSize: attrs_file.blockSize,
              tile_source_type: 11,
                image_base: `${window.location.protocol}//${
                  window.location.host
                }/${relative_url}/0_1_2`
            }
          };
          return options;
          }
        );
      });
    });
  };

  AutoproofreaderWidget.prototype.updateProofreadSegmentationLayer = function() {
    this.getProofreaderSegmentationLayerOptions().then(options => {
      // Create a skeleton projection layer for all stack viewers that
      // don't have one already.
      project.getStackViewers().forEach(function(sv) {
        var layer = sv.getLayer("proofread segmentation");
        if (layer) {
          sv.removeLayer();
        }
        if (options.visible) {
          if (!layer) {
            // Create new if not already present
            let stack = new CATMAID.Stack(
              "seg",
              "Segmenations",
              options.stack_attrs.dimensions,
              options.stack_attrs.resolution,
              { x: 0, y: 0, z: 0 },
              [],
              options.stack_attrs.scales,
              -2,
              "",
              "",
              "",
              0,
              { x: 0, y: 0, z: 0 },
              [0, 0, 0],
              [
                {
                  id: "no-mirror-id",
                  tile_source_type: options.stack_attrs.tile_source_type,
                  image_base: options.stack_attrs.image_base,
                  file_extension: "jpg",
                  tile_width: options.stack_attrs.tile_width,
                  tile_height: options.stack_attrs.tile_height,
                  title: "n5 mirror"
                }
              ]
            );
            layer = new CATMAID.ProofreadSegmentationLayer(
              options,
              sv,
              "segmenation layer",
              stack,
              0,
              true,
              1,
              false,
              "inherit",
              false,
              true
            );
            sv.addLayer("proofread segmentation", layer);
            sv.redraw();
          }

          // Update other options and display
          layer.updateOptions(options, false, true);
        } else if (layer) {
          sv.removeLayer("proofread segmentation");
          sv.redraw();
        }
      });
    });
  };

  /*
    --------------------------------------------------------------------------------
    ADMIN
    This section just registers the widget
    */

  AutoproofreaderWidget.prototype.destroy = function() {
    this.unregisterInstance();
    this.unregisterSource();
  };

  CATMAID.AutoproofreaderWidget = AutoproofreaderWidget;

  CATMAID.registerWidget({
    name: "Autoproofreading Widget",
    description: "Widget associated with the autoproofreader app",
    key: "autoproofreader-widget",
    creator: AutoproofreaderWidget,
    websocketHandlers: {
      "autoproofreader-result-update": function(client, payload) {
        // Update all job tables in autoproofreader widgets
        let autoproofreader_windows = WindowMaker.getOpenWindows(
          "autoproofreader-widget"
        );
        if (autoproofreader_windows) {
          for (let widget of autoproofreader_windows.values()) {
            widget.get_jobs();
          }
        }
      }
    }
  });
})(CATMAID);
