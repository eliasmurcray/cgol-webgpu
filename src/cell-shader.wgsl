@group(0) @binding(0) var<uniform> grid: vec2f;

@vertex
fn vertexMain(@location(0) pos: vec2f) -> @builtin(position) vec4f {
	let cell = vec2f(1, 1);
	let cellOffset = cell / grid * 2;
	let gridPos = (pos + 1) / grid - 1 * cellOffset;
	return vec4f(gridPos, 0, 1);
}

@fragment
fn fragmentMain() -> @location(0) vec4f {
	return vec4f(0, 0.5, 0.7, 1);
}