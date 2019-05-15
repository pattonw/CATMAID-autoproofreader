/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function (CATMAID) {
    'use strict';
    /**
     * This layer can project a complete skeleton into own tracing layer.
     */
    var ProofreadSkeletonVisualizationLayer = function (stackViewer, options) {
        this.stackViewer = stackViewer;
        CATMAID.PixiLayer.call(this);
        this.isHideable = true;
        // The currently displayed skeleton, node and arbor parser
        this.arborParserMap = {};
        this.node_map = {};
        this.currentResult = null;

        // Make sure there is an options object
        this.options = {};
        this.updateOptions(options, true);
        this.opacity = 1.0;

        CATMAID.PixiLayer.prototype._initBatchContainer.call(this);
        this.graphics = CATMAID.SkeletonElementsFactory.createSkeletonElements(
            {
                pixiLayer: this,
                stackViewer: stackViewer,
            },
            this.batchContainer
        );

        // Subscribe to active skeleton by default
        var initialSource = options && options.result_id
            ? options.result_id
            : undefined;
        if (initialSource) {
            this.replaceResult(initialSource);
        } else {
            CATMAID.Error("Proofread skeleton visualizer layer needs a result to visualize!")
        }

        this.resize(this.stackViewer.viewWidth, this.stackViewer.viewHeight);
        this.redraw();
    };

    /**
     * The set of options and defaults.
     */
    ProofreadSkeletonVisualizationLayer.options = {
        distanceFalloff: 1 / 500,
        // Indicate coloiring mode
        shadingMode: 'skeletoncolorgradient',
        // Indicate if edges should be rendered
        showEdges: true,
        // Indicate if nodes should be rendered
        showNodes: true,
        // Color of downstream nodes and edges
        dColor: 0xff8800,
        // Color of upstream nodes and edges
        uColor: 0xff0088,
        // Last used available source
        pColorC: 0x00ff00,
        pColorD: 0xff0000,
        bColor: 0xffffff,

        result_id: null,
        selected_points: new Set([]),
        visible: false,
        edgeWidth: 20,
    };

    /**
     * Update default options
     */
    ProofreadSkeletonVisualizationLayer.updateDefaultOptions = function (
        options
    ) {
        CATMAID.mergeOptions(
            ProofreadSkeletonVisualizationLayer.options,
            options || {},
            ProofreadSkeletonVisualizationLayer.options,
            true
        );
    };

    ProofreadSkeletonVisualizationLayer.prototype = Object.create(
        CATMAID.PixiLayer.prototype
    );
    ProofreadSkeletonVisualizationLayer.prototype.constructor = ProofreadSkeletonVisualizationLayer;

    ProofreadSkeletonVisualizationLayer.prototype.treenodeReference =
        'treenodeCircle';
    ProofreadSkeletonVisualizationLayer.prototype.NODE_RADIUS = 3;

    /**
     * Update options of this layer, giving preference to option fields in the
     * passed in object. If a known object key isn't available, the default can
     * optionally be set.
     */
    ProofreadSkeletonVisualizationLayer.prototype.updateOptions = function (
        options,
        setDefaults
    ) {
        CATMAID.mergeOptions(
            this.options,
            options || {},
            ProofreadSkeletonVisualizationLayer.options,
            setDefaults
        );
    };

    /**
     * Replace the current subsciption with a new one to the given source.
     *
     * @param {Object} source The source to subscribe to now
     */
    ProofreadSkeletonVisualizationLayer.prototype.replaceResult = function (
        result_id
    ) {
        if (result_id) {
            this.currentResult = result_id;
        } else {
            throw Error('visualization layer must have a result to visualize');
        }
    };

    /* Iterface methods */

    ProofreadSkeletonVisualizationLayer.prototype.getLayerName = function () {
        return 'proofread skeleton projection';
    };

    ProofreadSkeletonVisualizationLayer.prototype.resize = function (
        width,
        height
    ) {
        this.redraw();
    };

    /**
     * Adjust rendering to current field of view. No projections are added or
     * removed.
     */
    ProofreadSkeletonVisualizationLayer.prototype.redraw = function (
        completionCallback
    ) {
        this.update().then(() => {
            // Get current field of view in stack space
            var stackViewBox = this.stackViewer.createStackViewBox();
            var projectViewBox = this.stackViewer.primaryStack.createStackToProjectBox(
                stackViewBox
            );

            var screenScale = CATMAID.TracingOverlay.Settings.session.screen_scaling;
            // All graphics elements scale automatcally.
            // If in screen scale mode, where the size of all elements should
            // stay the same (regardless of zoom level), counter acting this is required.
            var dynamicScale = screenScale ? 1 / this.stackViewer.scale : false;

            this.graphics.scale(
                CATMAID.TracingOverlay.Settings.session.scale,
                this.stackViewer.primaryStack.minPlanarRes,
                dynamicScale
            );

            var planeDims = this.stackViewer.primaryStack.getPlaneDimensions();
            this.batchContainer.scale.set(this.stackViewer.pxPerNm());
            this.batchContainer.position.set(
                -projectViewBox.min[planeDims.x] * this.stackViewer.pxPerNm(),
                -projectViewBox.min[planeDims.y] * this.stackViewer.pxPerNm()
            );

            this._renderIfReady();

            if (CATMAID.tools.isFn(completionCallback)) {
                completionCallback();
            }
        });
    };

    /* Non-interface methods */

    ProofreadSkeletonVisualizationLayer.prototype.getArborParser = function (
        result_id
    ) {
        let self = this;
        if (!(self.arborParserMap && self.arborParserMap[result_id])) {
            return CATMAID.fetch(
                'ext/autoproofreader/' + project.id + '/proofread-tree-nodes',
                'GET',
                { result_id: result_id }
            ).then(nodes => {
                let ap = new CATMAID.ArborParser();
                let compact_tree_nodes = nodes.map(x => [
                    x.node_id.toString(),
                    x.parent_id === null ? null : x.parent_id.toString(),
                    null,
                    x.x,
                    x.y,
                    x.z,
                ]);
                ap.tree(compact_tree_nodes);
                self.node_map = nodes.reduce((acc, next) => {
                    acc[next.node_id] = next;
                    return acc;
                }, {});
                self.max_connectivity_score = nodes.reduce((acc, next) => {
                    return Math.max(acc, next.connectivity_score);
                }, 0);
                self.arborParserMap = {};
                self.arborParserMap[result_id] = ap;
                return ap;
            });
        } else {
            return new Promise(function (resolve, reject) {
                resolve(self.arborParserMap[result_id]);
            });
        }
    };

    /**
     * Update the internal representation of all projections. Missing projections
     * will be created (e.g. when new skeletons have been added to the source) and
     * obsolete ones will be removed.
     */
    ProofreadSkeletonVisualizationLayer.prototype.update = function () {
        var self = this;
        if (!self.currentResult) {
            throw Error('Visualization layer must have a result to visualize');
        } else {
            // Remove obsolete projections
            return self.getArborParser(self.currentResult).then(ap => {
                self.createVisualization(ap);
            });
        }
    };

    var setMapReverse = function (value, key) {
        this.set(key, value);
    };

    /**
     * Reload skeleton properties if skeleton models changed.
     */
    ProofreadSkeletonVisualizationLayer.prototype._updateModels = function (
        models
    ) {
        // TODO: If source colors should be used, update coloring
    };

    /**
     * Return promise to load all requested skeletons. If the skeleton is already
     * loaded, the back-end does't have to be asked.
     */
    ProofreadSkeletonVisualizationLayer.prototype.loadSkeletons = function (
        resultId
    ) {
        return CATMAID.fetch(
            'ext/autoproofreader/' + project.id + '/autoproofreader-results',
            'GET',
            { result_id: resultId }
        );
    };

    /**
     * Empty canvas.
     */
    ProofreadSkeletonVisualizationLayer.prototype.clear = function () {
        if (this.graphics) {
            this.graphics.containers.nodes.children.forEach(function (child) {
                if (child) {
                    child.destroy();
                }
            });
            this.graphics.containers.nodes.removeChildren();
            this.graphics.containers.lines.children.forEach(function (child) {
                if (child) {
                    child.destroy();
                }
            });
            this.graphics.containers.lines.removeChildren();
        }
    };

    /**
     * Recreate the graphics display.
     */
    ProofreadSkeletonVisualizationLayer.prototype.createVisualization = function (
        arborParser
    ) {
        // Empty space
        this.clear();

        // Return, if there is no node
        if (!arborParser) return;

        this._createProjection(arborParser);
    };

    /**
     * Render graphics output for a given skeleton, represented by an arbor
     * parser with respect to a given node in this skeleton.
     *
     * @param {ArborParser} arborParser An arbor parser for a given skeleton
     */
    ProofreadSkeletonVisualizationLayer.prototype._createProjection = function (
        arborParser
    ) {
        // Get nodes
        var arbor = arborParser.arbor;

        var material =
            ProofreadSkeletonVisualizationLayer.shadingModes[
            this.options.shadingMode
            ];
        if (!material) {
            throw new CATMAID.ValueError(
                "Couldn't find material method " + this.shadingMode
            );
        }

        // Allow opacity-only definitions for simplicity
        if (CATMAID.tools.isFn(material)) {
            material = {
                opacity: material,
                color: function (layer, color) {
                    return function () {
                        return color;
                    };
                },
            };
        }


        // Construct rendering option context
        var renderOptions = {
            positions: arborParser.positions,
            edges: arbor.edges,
            selected_points: this.options.selected_points,
            node_map: this.node_map,
            max_connectivity_score: this.max_connectivity_score,
            stackViewer: this.stackViewer,
            graphics: this.graphics,
            color: material.color(this, this.options.uColor, this.options.dColor, this.options.pColorC, this.options.pColorD, this.options.bColor),
            opacity: material.opacity(this, arbor, arbor),
            edgeWidth: this.graphics.Node.prototype.EDGE_WIDTH || this.options.edgeWidth,
            showEdges: this.options.showEdges,
            showNodes: this.options.showNodes,
            planeDims: this.stackViewer.primaryStack.getPlaneDimensions(),
            normalDim: this.stackViewer.primaryStack.getNormalDimension(),
        };

        // Render downstream nodes
        arbor.nodesArray().forEach(renderNodes, renderOptions);
    };

    function renderFlatEdge(n, pos1, pos2, branch, connectivity, options) {
        var color = options.color(
            n,
            pos1,
            pos1[options.normalDim],
            !branch,
            connectivity,
            branch
        );
        var opacity = options.opacity(n, pos1, pos1[options.normalDim]);
        var edge = new PIXI.Graphics();
        edge.lineStyle(options.edgeWidth, 0xffffff, opacity);
        edge.moveTo(pos1[options.planeDims.x], pos1[options.planeDims.y]);
        edge.lineTo(pos2[options.planeDims.x], pos2[options.planeDims.y]);
        edge.tint = color;
        options.graphics.containers.lines.addChild(edge);

        if (options.showNodes) {
            // pos1
            var c = new PIXI.Sprite(options.graphics.Node.prototype.NODE_TEXTURE);
            c.anchor.set(0.5);
            c.x = pos1[options.planeDims.x];
            c.y = pos1[options.planeDims.y];
            c.scale.set(options.graphics.Node.prototype.stackScaling);
            c.tint = color;
            c.alpha = opacity;
            options.graphics.containers.nodes.addChild(c);

            // pos2
            var c = new PIXI.Sprite(options.graphics.Node.prototype.NODE_TEXTURE);
            c.anchor.set(0.5);
            c.x = pos2[options.planeDims.x];
            c.y = pos2[options.planeDims.y];
            c.scale.set(options.graphics.Node.prototype.stackScaling);
            c.tint = color;
            c.alpha = opacity;
            options.graphics.containers.nodes.addChild(c);
        }
    }

    function renderSloppedEdge(n, above, below, parent_first, branch, connectivity, options) {
        let ndistabove = above[options.normalDim] - options.stackViewer.plane.constant;
        let ndistbelow = below[options.normalDim] - options.stackViewer.plane.constant;
        if (ndistabove < ndistbelow) {
            CATMAID.Error("Something went wrong with rendering the proofread skeleton!")
        }
        let abs_slope = { x: above.x - below.x, y: above.y - below.y, z: above.z - below.z };
        let slope = { x: abs_slope.x / abs_slope.z, y: abs_slope.y / abs_slope.z, z: abs_slope.z / abs_slope.z };
        let plane_intercept = { x: above.x - ndistabove * slope.x, y: above.y - ndistabove * slope.y, z: above.z - ndistabove * slope.z };
        let top_edge = above.z < plane_intercept.z ? above : plane_intercept;
        let bottom_edge = below.z > plane_intercept.z ? below : plane_intercept;

        let ndista = Math.min(ndistabove, options.stackViewer.primaryStack.resolution[options.normalDim]);
        let ndistb = Math.max(ndistbelow, -options.stackViewer.primaryStack.resolution[options.normalDim]);
        if (ndista > 0) {
            let up_line = { x: plane_intercept.x + ndista * slope.x, y: plane_intercept.y + ndista * slope.y, z: plane_intercept.z + ndista * slope.z };
            let color = options.color(n, up_line, up_line[options.normalDim], !parent_first, connectivity, branch)
            let opacity = options.opacity(n, up_line, up_line[options.normalDim]);
            let edge = new PIXI.Graphics();
            edge.lineStyle(options.edgeWidth, 0xffffff, opacity);
            edge.moveTo(bottom_edge[options.planeDims.x], bottom_edge[options.planeDims.y]);
            edge.lineTo(up_line[options.planeDims.x], up_line[options.planeDims.y]);
            edge.tint = color;
            options.graphics.containers.lines.addChild(edge);
        }
        if (ndistb < 0) {
            let down_line = { x: plane_intercept.x + ndistb * slope.x, y: plane_intercept.y + ndistb * slope.y, z: plane_intercept.z + ndistb * slope.z };
            let color = options.color(n, down_line, down_line[options.normalDim], parent_first, connectivity, branch);
            let opacity = options.opacity(n, down_line, down_line[options.normalDim]);
            let edge = new PIXI.Graphics();
            edge.lineStyle(options.edgeWidth, 0xffffff, opacity);
            edge.moveTo(top_edge[options.planeDims.x], top_edge[options.planeDims.y]);
            edge.lineTo(down_line[options.planeDims.x], down_line[options.planeDims.y]);
            edge.tint = color;
            options.graphics.containers.lines.addChild(edge);
        }

        let color = options.color(undefined, undefined, undefined, true);
        let opacity = 1;


    }

    /**
     * Render nodes in a Pixi context.
     */
    function renderNodes(n, i, nodes) {
        /* jshint validthis: true */ // `this` is bound to a set of options above

        // render node that are not in this layer
        var stack = this.stackViewer.primaryStack;
        var z_res = stack.resolution.z;
        // Positions are in project space
        var pos1 = this.positions[n];
        let ndist1 = pos1[this.normalDim] - this.stackViewer.plane.constant

        // draw node
        if (Math.abs(ndist1) <= z_res / 2) {
            var c = new PIXI.Sprite(this.graphics.Node.prototype.NODE_TEXTURE);
            c.anchor.set(0.5);
            c.x = pos1[this.planeDims.x];
            c.y = pos1[this.planeDims.y];
            c.scale.set(this.graphics.Node.prototype.stackScaling);
            c.tint = this.color(undefined, undefined, undefined, true, 1, false);
            c.alpha = 1;
            this.graphics.containers.nodes.addChild(c);

        }

        // draw missing branch indicator if asked for
        if (this.selected_points.has(parseInt(n))) {
            let nn = this.node_map[n]
            var pos2 = { x: nn.x + nn.branch_dx, y: nn.y + nn.branch_dy, z: nn.z + nn.branch_dz };

            let ndist2 = pos2[this.normalDim] - this.stackViewer.plane.constant

            let display_needed = (ndist1 <= z_res / 2 && ndist2 >= -z_res / 2) || (ndist1 >= -z_res / 2 && ndist2 <= z_res / 2)
            if (display_needed) {
                if (Math.abs(ndist1) <= z_res / 2 && Math.abs(ndist2) <= z_res / 2) {
                    renderFlatEdge(n, pos1, pos2, true, undefined, this);
                } else {
                    if (ndist1 > ndist2) {
                        renderSloppedEdge(n, pos1, pos2, false, true, undefined, this);
                    } else {
                        renderSloppedEdge(n, pos2, pos1, false, true, undefined, this);
                    }
                }

                if (Math.abs(ndist2) <= z_res / 2) {
                    var c = new PIXI.Sprite(this.graphics.Node.prototype.NODE_TEXTURE);
                    c.anchor.set(0.5);
                    c.x = pos2[this.planeDims.x];
                    c.y = pos2[this.planeDims.y];
                    c.scale.set(this.graphics.Node.prototype.stackScaling);
                    c.tint = this.color(undefined, undefined, undefined, true, 1);
                    c.alpha = 1;
                    this.graphics.containers.nodes.addChild(c);

                }
            }
        }

        // draw edges
        var e = this.edges[n];
        if (e) {

            var pos2 = this.positions[e];
            let connectivity = this.node_map[n].connectivity_score / this.max_connectivity_score;

            let ndist2 = pos2[this.normalDim] - this.stackViewer.plane.constant

            let display_needed = (ndist1 <= z_res / 2 && ndist2 >= -z_res / 2) || (ndist1 >= -z_res / 2 && ndist2 <= z_res / 2)
            if (display_needed) {
                if (Math.abs(ndist1) <= z_res / 2 && Math.abs(ndist2) <= z_res / 2) {
                    renderFlatEdge(n, pos1, pos2, false, connectivity, this);
                } else {
                    if (ndist1 > ndist2) {
                        renderSloppedEdge(n, pos1, pos2, true, false, connectivity, this);
                    } else {
                        renderSloppedEdge(n, pos2, pos1, false, false, connectivity, this);
                    }
                }
            }
        }
    }

    /**
     * A set of shading modes for the projected skeleton parts. Each function
     * returns a color based on a node distance and world position.
     */
    ProofreadSkeletonVisualizationLayer.shadingModes = {
        /**
         * Shade a skeleton with a plain color for upstream and downstream nodes.
         */
        plain: function (layer, arbor, subarbor) {
            return function (node, pos, zStack) {
                return 1;
            };
        },

        /**
         * Change skeleton color towards plain colors with increasing Z distance.
         */
        skeletoncolorgradient: {
            opacity: function (layer, arbor, subarbor) {
                return function (node, pos, z) {
                    return 1;
                };
            },
            color: function (layer, up_color, down_color, parent_color_connected, parent_color_disconnected, branch_color) {
                var falloff = layer.options.distanceFalloff;
                var stackViewer = layer.stackViewer;
                var u_color = CATMAID.tools.cssColorToRGB(up_color);
                var d_color = CATMAID.tools.cssColorToRGB(down_color);
                var p_color_c = CATMAID.tools.cssColorToRGB(parent_color_connected);
                var p_color_d = CATMAID.tools.cssColorToRGB(parent_color_disconnected);
                var b_color = CATMAID.tools.cssColorToRGB(branch_color);
                return function (node, pos, z, p, connectivity, b) {
                    // Merge colors
                    if (p) {
                        return ((p_color_c.r * connectivity + p_color_d.r * (1 - connectivity)) * 255 << 16)
                            + ((p_color_c.g * connectivity + p_color_d.g * (1 - connectivity)) * 255 << 8)
                            + (p_color_c.b * connectivity + p_color_d.b * (1 - connectivity)) * 255;
                    }
                    if (b) {
                        return (b_color.r * 255 << 16) + (b_color.g * 255 << 8) + b_color.b * 255;
                    }
                    var zDist = z - stackViewer.plane.constant;
                    if (zDist >= 0) {
                        return (u_color.r * 255 << 16) + (u_color.g * 255 << 8) + u_color.b * 255;
                    } else {
                        return (d_color.r * 255 << 16) + (d_color.g * 255 << 8) + d_color.b * 255;
                    }
                };
            },
        },
    };

    // Make layer available in CATMAID namespace
    CATMAID.ProofreadSkeletonVisualizationLayer = ProofreadSkeletonVisualizationLayer;
})(CATMAID);
