const fs = require('fs').promises;
const camelcase = require('camelcase');
const { promisify } = require('util');
const rimraf = promisify(require('rimraf'));
const { dirname } = require('path');
const { parse } = require('node-html-parser');

const defaultAttributeList = ['stroke-width'];

let transform = {
  qwik: (svg, componentName) => {
    const svgElement = parse(svg).childNodes[0];

    defaults = {};

    defaultAttributeList
      .map((attrName) => [attrName, svgElement.getAttribute(attrName)])
      .filter(([name, value]) => value != null)
      .forEach(([name, value]) => {
        console.log(componentName, 'removing attr', name, value);
        svgElement.removeAttribute(name);
        defaults[name] = value;
      });

    console.log(componentName, defaults, svgElement.attributes);

    return [
      "import { HTMLAttributes } from '@builder.io/qwik'",
      '',
      'interface ' +
        componentName +
        'Props extends HTMLAttributes<SVGElement> {',
      Object.entries(defaults)
        .map(([k, v]) => "  '" + k + "'?: " + mostStrictTypeOf(v))
        .join('\n'),
      '}',
      '',
      'const defaults = ' + JSON.stringify(defaults),
      '',
      'export const ' +
        componentName +
        ' = (props: ' +
        componentName +
        'Props) => {',
      '  const attrs = {...defaults, ...props}',
      '  return (',
      '    // @ts-ignore',
      svgElement
        .toString()
        .split('\n')
        .filter((ln) => ln.trim().length > 0)
        .map((ln) => '    ' + ln)
        .join('\n')
        .replace('<svg', '<svg {...attrs}'),
      '  )',
      ' }',
      '',
    ].join('\n');
  },
};

function mostStrictTypeOf(v) {
  try {
    return typeof JSON.parse(v);
  } catch (error) {
    return 'string';
  }
}

async function getIcons(style) {
  let files = await fs.readdir(`./heroicons/optimized/${style}`);
  return Promise.all(
    files.map(async (file) => ({
      svg: await fs.readFile(`./heroicons/optimized/${style}/${file}`, 'utf8'),
      componentName: `${camelcase(file.replace(/\.svg$/, ''), {
        pascalCase: true,
      })}Icon`,
    }))
  );
}

function exportAll(icons, format, includeExtension = true) {
  return icons
    .map(({ componentName }) => {
      let extension = includeExtension ? '.js' : '';
      if (format === 'esm') {
        return `export { default as ${componentName} } from './${componentName}${extension}'`;
      }
      return `module.exports.${componentName} = require("./${componentName}${extension}")`;
    })
    .join('\n');
}

async function ensureWrite(file, text) {
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

async function ensureWriteJson(file, json) {
  await ensureWrite(file, JSON.stringify(json, null, 2));
}

async function buildIconsTs(package, style) {
  let outDir = `./${package}/${style}/tsx`;
  let icons = await getIcons(style);

  await Promise.all(
    icons.flatMap(async ({ componentName, svg }) => {
      let content = await transform[package](svg, componentName);
      let types = null;
      // package === 'react'
      //   ? `import * as React from 'react';\ndeclare function ${componentName}(props: React.ComponentProps<'svg'> & { title?: string, titleId?: string }): JSX.Element;\nexport default ${componentName};\n`
      //   : `import type { FunctionalComponent, HTMLAttributes, VNodeProps } from 'vue';\ndeclare const ${componentName}: FunctionalComponent<HTMLAttributes & VNodeProps>;\nexport default ${componentName};\n`

      return [
        ensureWrite(`${outDir}/${componentName}.tsx`, content),
        ...(types
          ? [ensureWrite(`${outDir}/${componentName}.d.ts`, types)]
          : []),
      ];
    })
  );

  // await ensureWrite(`${outDir}/index.js`, exportAll(icons, format))

  // await ensureWrite(`${outDir}/index.d.ts`, exportAll(icons, 'esm', false))
}

async function main(package) {
  console.log(`Building ${package} package...`);

  await Promise.all([
    rimraf(`./${package}/20/solid/*`),
    rimraf(`./${package}/24/outline/*`),
    rimraf(`./${package}/24/solid/*`),
  ]);

  await Promise.all([
    buildIconsTs(package, '20/solid'),
    buildIconsTs(package, '24/outline'),
    buildIconsTs(package, '24/solid'),
    // const tsPackageJson = { type: 'module', sideEffects: false }
    // ensureWriteJson(`./${package}/20/solid/package.json`, tsPackageJson),
    // ensureWriteJson(`./${package}/24/outline/package.json`, tsPackageJson),
    // ensureWriteJson(`./${package}/24/solid/package.json`, tsPackageJson),
  ]);

  return console.log(`Finished building ${package} package.`);
}

let [package] = process.argv.slice(2);

if (!package) {
  throw new Error('Please specify a package');
}

main(package);
