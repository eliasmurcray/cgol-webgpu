import "./index.css";
import shaderSource from "./cell-shader.wgsl";

const GRID_SIZE = 32;
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

// Drawing a square
const vertices = new Float32Array([
  // Triangle 1
  -0.8, 0.8, 0.8, 0.8, -0.8, -0.8,
  // Triangle 2
  -0.8, -0.8, 0.8, 0.8, 0.8, -0.8,
]);

const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(vertexBuffer, 0, vertices);

const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [
    {
      format: "float32x2",
      offset: 0,
      shaderLocation: 0,
    },
  ],
};

const cellShaderModule = device.createShaderModule({
  code: shaderSource,
  label: "Cell shader",
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: "auto",
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout],
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [
      {
        format: canvasFormat,
      },
    ],
  },
});

// Uniform buffer that describes the grid
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

const bindGroup = device.createBindGroup({
  label: "Cell renderer bind group",
  layout: cellPipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: uniformBuffer,
      },
    },
  ],
});

// Clear canvas
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({
  colorAttachments: [
    {
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: [0.15, 0.15, 0.2, 1.0],
      storeOp: "store",
    },
  ],
});
pass.setPipeline(cellPipeline);
pass.setVertexBuffer(0, vertexBuffer);
pass.setBindGroup(0, bindGroup);
pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);
pass.end();
const commandBuffer = encoder.finish();
device.queue.submit([commandBuffer]);
