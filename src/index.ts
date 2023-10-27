import "./index.css";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("No canvas.");
}

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
if (!context) {
  throw new Error("Failed to retrieve GPU context.");
}

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: canvasFormat,
});

// Clear canvas
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({
  colorAttachments: [
    {
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      storeOp: "store",
    },
  ],
});
pass.end();
const commandBuffer = encoder.finish();
device.queue.submit([commandBuffer]);
