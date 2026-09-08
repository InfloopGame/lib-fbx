import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBinaryFbx } from '../helpers/binary-fbx'

const dir = dirname(fileURLToPath(import.meta.url))

function write(name: string, data: Uint8Array): void {
  writeFileSync(join(dir, name), data)
}

write(
  'binary-7400-triangle.fbx',
  buildBinaryFbx({
    version: 7400,
    nodes: [
      {
        name: 'FBXHeaderExtension',
        children: [{ name: 'FBXVersion', props: [{ kind: 'I', value: 7400 }] }],
      },
      {
        name: 'Objects',
        children: [
          {
            name: 'Geometry',
            props: [
              { kind: 'L', value: 100 },
              { kind: 'S', value: 'Geometry::Triangle' },
              { kind: 'S', value: 'Mesh' },
            ],
            children: [
              {
                name: 'Vertices',
                props: [{ kind: 'array', type: 'd', values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
              },
              {
                name: 'PolygonVertexIndex',
                props: [{ kind: 'array', type: 'i', values: [0, 1, -3] }],
              },
              {
                name: 'Normals',
                props: [{ kind: 'array', type: 'f', values: [0, 0, 1], compress: true }],
              },
            ],
          },
          {
            name: 'Model',
            props: [
              { kind: 'L', value: 200 },
              { kind: 'S', value: 'Model::Triangle' },
              { kind: 'S', value: 'Mesh' },
            ],
            children: [
              {
                name: 'Properties70',
                children: [
                  {
                    name: 'P',
                    props: [
                      { kind: 'S', value: 'Lcl Translation' },
                      { kind: 'S', value: 'Lcl Translation' },
                      { kind: 'S', value: '' },
                      { kind: 'S', value: 'A+' },
                      { kind: 'D', value: 1 },
                      { kind: 'D', value: 2 },
                      { kind: 'D', value: 3 },
                    ],
                  },
                  {
                    name: 'P',
                    props: [
                      { kind: 'S', value: 'Visibility' },
                      { kind: 'S', value: 'bool' },
                      { kind: 'S', value: '' },
                      { kind: 'S', value: '' },
                      { kind: 'C', value: true },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'Connections',
        children: [
          {
            name: 'C',
            props: [
              { kind: 'S', value: 'OO' },
              { kind: 'L', value: 100 },
              { kind: 'L', value: 200 },
            ],
          },
        ],
      },
    ],
  }),
)

write(
  'binary-7500-props.fbx',
  buildBinaryFbx({
    version: 7500,
    nodes: [
      {
        name: 'Objects',
        children: [
          {
            name: 'Video',
            props: [
              { kind: 'L', value: 9 },
              { kind: 'S', value: 'Video::clip' },
              { kind: 'S', value: 'Clip' },
            ],
            children: [
              { name: 'Flag', props: [{ kind: 'Y', value: -3 }] },
              { name: 'Scale', props: [{ kind: 'F', value: 1.5 }] },
              { name: 'Blob', props: [{ kind: 'R', value: new Uint8Array([1, 2, 3, 4]) }] },
              { name: 'Enabled', props: [{ kind: 'C', value: false }] },
              {
                name: 'Weights',
                props: [{ kind: 'array', type: 'b', values: [true, false, true] }],
              },
              {
                name: 'Times',
                props: [{ kind: 'array', type: 'l', values: [1, 2, 3], compress: true }],
              },
            ],
          },
          {
            name: 'Pose',
            props: [
              { kind: 'L', value: 8 },
              { kind: 'S', value: 'Pose::Bind' },
              { kind: 'S', value: 'BindPose' },
            ],
            children: [
              { name: 'PoseNode', children: [{ name: 'Node', props: [{ kind: 'I', value: 1 }] }] },
              { name: 'PoseNode', children: [{ name: 'Node', props: [{ kind: 'I', value: 2 }] }] },
            ],
          },
        ],
      },
    ],
  }),
)

write(
  'binary-6100-embedded.fbx',
  buildBinaryFbx({
    version: 6100,
    nodes: [
      {
        name: 'Objects',
        children: [
          {
            name: 'Model',
            props: [
              { kind: 'L', value: 10 },
              { kind: 'S', value: 'Model::Box' },
              { kind: 'S', value: 'Mesh' },
            ],
            children: [
              {
                name: 'Vertices',
                props: [{ kind: 'array', type: 'd', values: [0, 0, 0, 1, 0, 0] }],
              },
              {
                name: 'Properties60',
                children: [
                  {
                    name: 'Property',
                    props: [
                      { kind: 'S', value: 'Lcl Translation' },
                      { kind: 'S', value: 'Lcl Translation' },
                      { kind: 'S', value: 'A+' },
                      { kind: 'D', value: 4 },
                      { kind: 'D', value: 5 },
                      { kind: 'D', value: 6 },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: 'Deformer',
            props: [
              { kind: 'L', value: 20 },
              { kind: 'S', value: 'Deformer::Skin' },
              { kind: 'S', value: 'Skin' },
            ],
          },
          {
            name: 'Video',
            props: [
              { kind: 'L', value: 30 },
              { kind: 'S', value: 'Video::img.png' },
            ],
          },
          {
            name: 'Texture',
            props: [
              { kind: 'L', value: 40 },
              { kind: 'S', value: 'Texture::img.png' },
            ],
          },
        ],
      },
      {
        name: 'Connections',
        children: [
          {
            name: 'C',
            props: [
              { kind: 'S', value: 'OO' },
              { kind: 'L', value: 20 },
              { kind: 'L', value: 10 },
            ],
          },
        ],
      },
    ],
  }),
)

write(
  'binary-6000.fbx',
  buildBinaryFbx({
    version: 6000,
    nodes: [
      {
        name: 'Objects',
        children: [
          {
            name: 'Model',
            props: [
              { kind: 'L', value: 10 },
              { kind: 'S', value: 'Model::Box' },
              { kind: 'S', value: 'Mesh' },
            ],
            children: [
              {
                name: 'Vertices',
                props: [{ kind: 'array', type: 'd', values: [0, 0, 0, 1, 0, 0] }],
              },
              {
                name: 'Properties60',
                children: [
                  {
                    name: 'Property',
                    props: [
                      { kind: 'S', value: 'Lcl Translation' },
                      { kind: 'S', value: 'Lcl Translation' },
                      { kind: 'S', value: 'A+' },
                      { kind: 'D', value: 4 },
                      { kind: 'D', value: 5 },
                      { kind: 'D', value: 6 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }),
)

console.log('binary fixtures written')
