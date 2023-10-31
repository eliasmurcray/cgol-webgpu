import "./index.css";
import cellShaderSource from "./cell-shader.wgsl";
import simulationShaderSource from "./simulation-shader.wgsl";

const GRID_SIZE = 16;
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

const SQUARE_SIZE = 0.8;

// Drawing a square
const vertices = new Float32Array([
  // Triangle 1
  -SQUARE_SIZE,
  SQUARE_SIZE,
  SQUARE_SIZE,
  SQUARE_SIZE,
  -SQUARE_SIZE,
  -SQUARE_SIZE,
  // Triangle 2
  -SQUARE_SIZE,
  -SQUARE_SIZE,
  SQUARE_SIZE,
  SQUARE_SIZE,
  SQUARE_SIZE,
  -SQUARE_SIZE,
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
  code: cellShaderSource,
  label: "Cell Shader",
});

const simulationShaderModule = device.createShaderModule({
  label: "Simulation Shader",
  code: simulationShaderSource,
});

// Create the bind group layout and pipeline layout.
const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      buffer: {},
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      buffer: { type: "read-only-storage" },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" },
    },
  ],
});

const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [bindGroupLayout],
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout,
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

// Create a compute pipeline that updates the game state.
const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
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

// Cell state storage buffer
const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
];

// Mark every third cell of the first grid as active.
for (let i = 0; i < cellStateArray.length; i += 3) {
  cellStateArray[i] = 1;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

// Mark every other cell of the second grid as active.
for (let i = 0; i < cellStateArray.length; i++) {
  cellStateArray[i] = i % 2;
}
device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);

// Create a bind group to pass the grid uniforms into the pipeline
const bindGroups = [
  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[0] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[1] },
      },
    ],
  }),
  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[1] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[0] },
      },
    ],
  }),
];

const UPDATE_INTERVAL = 200;
let step = 0;
function updateGrid() {
  const encoder = device.createCommandEncoder();

  const computePass = encoder.beginComputePass();

  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);

  const workgroupCount = Math.ceil(GRID_SIZE / 8);
  computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

  computePass.end();
  step++;

  // Start a render pass
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context!.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
        storeOp: "store",
      },
    ],
  });

  // Draw the grid.
  pass.setPipeline(cellPipeline);
  pass.setBindGroup(0, bindGroups[step % 2]);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

  // End the render pass and submit the command buffer
  pass.end();
  device.queue.submit([encoder.finish()]);
}

setInterval(updateGrid, UPDATE_INTERVAL);
