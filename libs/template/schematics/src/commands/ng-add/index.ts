import {
  chain,
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
} from '@angular-devkit/schematics';
import {
  addImportToModule,
  insertImport,
} from '@schematics/angular/utility/ast-utils';
import {
  addPackageJsonDependency,
  NodeDependency,
} from '@schematics/angular/utility/dependencies';
import * as ts from 'typescript';

import {
  findRootModule,
  getLatestNodePackage,
  getProject,
  InsertChange,
  packageName,
  peerDependencies,
} from '../../common';
import { SchemaOptions } from './schema';
import { combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function getModuleFile(tree: Tree, options: SchemaOptions): ts.SourceFile {
  const modulePath = options.module;

  if (!tree.exists(modulePath)) {
    throw new SchematicsException(`File ${modulePath} does not exist.`);
  }

  const text = tree.read(modulePath);
  if (text === null) {
    throw new SchematicsException(`File ${modulePath} does not exist.`);
  }
  const sourceText = text.toString('utf-8');

  return ts.createSourceFile(
    modulePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
}

function applyChanges(tree: Tree, path: string, changes: InsertChange[]): Tree {
  const recorder = tree.beginUpdate(path);

  for (const change of changes) {
    recorder.insertLeft(change.pos, change.toAdd);
  }

  tree.commitUpdate(recorder);

  return tree;
}

function addImportsToModuleFile(
  options: SchemaOptions,
  imports: string[],
  importName = packageName
): Rule {
  return (tree) => {
    const module = getModuleFile(tree, options);
    const importChanges = insertImport(
      module,
      options.module,
      imports.join(', '),
      importName
    );

    return applyChanges(tree, options.module, [
      importChanges,
    ] as InsertChange[]);
  };
}

function addImportsToModuleDeclaration(
  options: SchemaOptions,
  imports: string[]
): Rule {
  return (tree) => {
    const module = getModuleFile(tree, options);

    const importChanges = imports.map(
      (imp) => addImportToModule(module, options.module, imp, packageName)[0]
    );

    return applyChanges(tree, options.module, importChanges as InsertChange[]);
  };
}

function addPackageJsonDependencies(
  packages: (string | NodeDependency)[]
): Rule {
  return (tree: Tree, context: SchematicContext): Observable<Tree> => {
    const packageNames = packages.map((p) =>
      typeof p === 'string' ? p : p.name
    );
    return combineLatest(
      packageNames.map((name) => getLatestNodePackage(name))
    ).pipe(
      map((nodeDependencies: NodeDependency[]) => {
        nodeDependencies.forEach((nodeDependency) => {
          addPackageJsonDependency(tree, nodeDependency);
          context.logger.info(
            `✅️Added dependency ${nodeDependency.name}@${nodeDependency.version}`
          );
        });
        return tree;
      })
    );
  };
}

export function ngAdd(options: SchemaOptions): Rule {
  return async (tree: Tree) => {
    const project = await getProject(tree, options.project);
    const sourceRoot = (project && project.sourceRoot) ?? 'src';
    const modulesToAdd = ['LetModule', 'PushModule'];

    options.module = findRootModule(tree, options.module, sourceRoot) as string;

    return chain([
      addPackageJsonDependencies(peerDependencies),
      addImportsToModuleFile(options, modulesToAdd),
      addImportsToModuleDeclaration(options, modulesToAdd),
    ]);
  };
}
