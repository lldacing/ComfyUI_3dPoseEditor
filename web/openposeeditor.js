import { app } from "/scripts/app.js"
import { ComfyWidgets } from "/scripts/widgets.js"

class OpenPoseEditor {
    constructor(app, node) {
        this.node = node
        this.images = node.widgets.filter(w => ['pose','depth','normal','canny'].indexOf(w.name)> -1)

        this.iframe =  document.createElement('iframe')
        this.iframe.src = '/extensions/ComfyUI_3dPoseEditor/editor.html'
    }

    async uploadPoseFile(imageData) {
        for (let type in imageData) {
            // pose depth normal canny
            const blobData = await fetch(imageData[type]).then(r => r.blob())
            const filename = `${type}_${this.node.name}.png`

            const imageWidget = this.images[this.images.findIndex(i => i.name === type)]

            let formData = new FormData()
            formData.append('image', blobData, filename)
            formData.append('overwrite', 'true')
            formData.append('type', 'temp')
            // formData.append('subfolder', '3dposeeditor')

            const resp = await app.api.fetchApi('/upload/image', {
                method: 'POST',
                body: formData,
            })

            if (resp.status === 200) {
                const data = await resp.json()

                console.debug("[3D Pose Editor] Upload image success.", data.name)

                imageWidget.options.value = data.name
                imageWidget.value = data.name
            }
        }
    }
}

function initWidgets(node, inputName, inputData, app) {
    node.name = inputName

    const postMessage = function (message) {
        node.openposeeditor?.iframe?.contentWindow?.postMessage(message, "*")
    }

    node.isMakingImages = false
    const debounce = function (func, timeout = 300) {
        let timer
        return (...args) => {
            clearTimeout(timer)
            timer = setTimeout(() => { func.apply(this, args) }, timeout)
        }
    }

    function doSyncSizeToPoseEditor(widgetNode) {
        postMessage({
            cmd: 'openpose-3d',
            method: 'SetOutputSize',
            type: 'call',
            payload: [widgetNode.widgets[0].value, widgetNode.widgets[1].value],
        })
    }

    const syncSizeToPoseEditor = debounce(doSyncSizeToPoseEditor, 500)

    node.initing = true
    node.openposeeditor = new OpenPoseEditor(app, node)
    const poseEditorWidget = node.addDOMWidget('openPose3D', 'openPose3D', node.openposeeditor.iframe, {  
        margin: 12,
        serialize: false,
        getHeight: () => 400,
        handleMessage: async (event) => {
            const {data} = event
            if (event.source.frameElement !== node.openposeeditor.iframe) return;

            if (data && data.cmd && data.cmd === 'openpose-3d' && data.method) {
                const method = data.method
                if (data.type === 'event' && 'SceneReady' === method) {
                    console.debug(`${node?.id} 3d Pose Edit 场景加载完成`)
                    // 设置宽和高
                    syncSizeToPoseEditor(node)
                } else if ('SetOutputSize' === method) {
                    if (node.initing) {
                        node.initing = false
                        postMessage({
                            cmd: 'openpose-3d',
                            method: 'MakeImages',
                            type: 'call',
                            payload: null,
                        })
                    }
                } else if ('MakeImages' === method && false === node.isMakingImages) {
                    node.isMakingImages = true
                    await node.openposeeditor.uploadPoseFile(data.payload)
                    node.isMakingImages = false
                    postMessage({
                        cmd: 'openpose-3d',
                        method: 'GetOutputSize',
                        type: 'call',
                        payload: null,
                    })
                } else if (data.type === 'return' && 'GetOutputSize' === method) {
                    let needUpdate = false
                    if (data.payload && data.payload?.width) {
                        if (node.widgets[0].value !== data.payload?.width) {
                            node.widgets[0].value = data.payload?.width
                            needUpdate = true
                        }
                        if (node.widgets[1].value !== data.payload?.height) {
                            node.widgets[1].value = data.payload?.height
                            needUpdate = true
                        }
                    }
                    app.graph.setDirtyCanvas(true)
                }
            }
        }
      });

    node.onRemoved = () => {
        window.removeEventListener('message', poseEditorWidget.options.handleMessage, false)

        for (let y in node.widgets) {
            if (node.widgets[y].type === 'openPose3D') {
                node.widgets[y].element.remove()
                delete node.openposeeditor
            }
        }
    }

    node.onResize = function () {
        let [w, h] = this.size
        if (w <= 400) w = 400
        if (h <= 400) h = 400

        this.size = [w, h]
    }

    poseEditorWidget.onRemove = () => {
        window.removeEventListener('message', poseEditorWidget.options.handleMessage, false)
        poseEditorWidget.openposeeditor?.remove()
    }

    window.addEventListener('message', poseEditorWidget.options.handleMessage, false)

    function initSizeWidgets(currentNode) {
        const widthWidget = currentNode.widgets[0]
        let orgWidthWidgetCallBack = widthWidget?.callback
        widthWidget.callback = (value) => {
            if (orgWidthWidgetCallBack) {
                orgWidthWidgetCallBack.call(widthWidget, value);
            }
    
            console.debug(`width 值变化: ${value}`);
            syncSizeToPoseEditor(node)
        };
        const heightWidget = currentNode.widgets[1]
        let orgHeightWidgetCallBack = heightWidget?.callback
        heightWidget.callback = (value) => {
            if (orgHeightWidgetCallBack) {
                orgHeightWidgetCallBack.call(heightWidget, value);
            }
            syncSizeToPoseEditor(node)
            console.debug(`height 值变化: ${value}`);
        };
    }

    initSizeWidgets(node)
}

app.registerExtension({
    name: 'Comfy.ReadOnlyStringWidget',
    init() {
        const stringWidget = ComfyWidgets.STRING;
        ComfyWidgets.STRING = function (node, inputName, inputData, app) {
            const [type, config] = inputData
            const w = stringWidget.apply(this, arguments)
            if (config?.multiline) {
                const widget = w.widget
                // 如果配置了readOnly，设置为只读
                if (config?.read_only) {
                    if (widget.element) {
                    widget.element.readOnly = true
                    }
                }
                return w;
            } else if (config?.read_only) {
                const widget = w.widget
                widget.callback = null
                widget.disabled = true
            }
			return w;
		};
    }
})

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

app.registerExtension({
    name: "Hina.PoseEditor3D",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Hina.PoseEditor3D") {
            console.log("[3D Pose Editor] Registering node...", nodeData)

            const onNodeCreated = nodeType.prototype.onNodeCreated

            nodeType.prototype.onNodeCreated = async function() {
                const r = onNodeCreated
                    ? onNodeCreated.apply(this, arguments)
                    : undefined

                let openPoseNode = app.graph._nodes.filter(
                    (wi) => wi.type == "Hina.PoseEditor3D"
                )

                let nodeName = generateId()

                console.log(`[3D Pose Editor] Create PoseNode: ${nodeName}`)

                initWidgets.apply(this, [this, nodeName, {}, app])
                return r
            }
        }
    }
})
