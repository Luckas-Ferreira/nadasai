import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import { PendingTransitionService } from './pending-transition.service';
import { WorkspaceService } from './workspace.service';

@Component({ standalone: true, template: '' })
class Blank {}

function pngFile(name = 'photo.png'): File {
  return new File([new Uint8Array(8)], name, { type: 'image/png' });
}

function png(bytes = 4): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}

/**
 * Este serviço é a peça que faz a cadeia existir, e o histórico dela é de perda
 * SILENCIOSA de arquivo — nunca de erro. A versão que ele substituiu era um
 * `(click)` no rail e na barra mobile, então essas duas superfícies levavam o
 * resultado adiante e todas as outras saídas o descartavam sem dizer nada: a
 * paleta, o switcher de módulo, o link "Módulos", o botão Voltar e uma URL
 * digitada. Quatro dessas são as únicas formas de SAIR de um módulo, ou seja,
 * cruzar módulos era exatamente o caso que perdia o arquivo.
 *
 * Por isso os testes aqui são sobre NAVEGAÇÃO de verdade, com um Router real, e
 * não sobre chamar `tryCommit()` na mão: chamar na mão testaria a função que
 * nunca esteve quebrada, e não o gancho que estava.
 */
describe('PendingTransitionService', () => {
  let pending: PendingTransitionService;
  let workspace: WorkspaceService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'a', component: Blank },
          { path: 'b', component: Blank },
        ]),
      ],
    });
    pending = TestBed.inject(PendingTransitionService);
    workspace = TestBed.inject(WorkspaceService);
    router = TestBed.inject(Router);
  });

  it('starts with nothing pending', () => {
    expect(pending.hasPending()).toBe(false);
    expect(pending.tryCommit()).toBe(false);
  });

  it('commits on navigation, whatever surface started it', async () => {
    workspace.load(pngFile());
    pending.registerResult('remove-bg', png(), 'nobg', 'png');

    expect(pending.hasPending()).toBe(true);

    await router.navigateByUrl('/a');

    expect(pending.hasPending()).toBe(false);
    expect(workspace.currentFile()?.name).toBe('photo-nobg.png');
    expect(workspace.history()).toContain('remove-bg');
  });

  /**
   * O commit corre no `NavigationStart`, e não no fim: precisa aterrissar
   * enquanto o componente antigo ainda vive, para que o construtor da próxima
   * ferramenta já leia a sessão atualizada.
   */
  it('lands before the next route is activated', async () => {
    workspace.load(pngFile());
    pending.registerResult('crop', png(), 'crop', 'png');

    let nameAtActivation: string | undefined;
    router.events.subscribe((e) => {
      if (e.constructor.name === 'ActivationStart') {
        nameAtActivation ??= workspace.currentFile()?.name;
      }
    });

    await router.navigateByUrl('/a');

    expect(nameAtActivation).toBe('photo-crop.png');
  });

  it('clears without running', async () => {
    workspace.load(pngFile());
    pending.registerResult('crop', png(), 'crop', 'png');
    pending.clear();

    await router.navigateByUrl('/a');

    expect(workspace.currentFile()?.name).toBe('photo.png');
    expect(workspace.history()).toEqual([]);
  });

  it('keeps only the last registration', async () => {
    workspace.load(pngFile());
    pending.registerResult('crop', png(), 'crop', 'png');
    pending.registerResult('compress', png(), 'min', 'png');

    await router.navigateByUrl('/a');

    expect(workspace.currentFile()?.name).toBe('photo-min.png');
    expect(workspace.history()).toEqual(['compress']);
  });

  /**
   * `registerResult` existe para que o try/catch não seja copiado em vinte
   * componentes — porque um try/catch copiado vinte vezes é um que uma das
   * vinte esquece. `apply` pode lançar (um teto de tamanho, um tipo que ninguém
   * reconhece), e um commit que lança durante o `NavigationStart` derruba a
   * navegação inteira: a pessoa clica num chip e não sai do lugar.
   */
  it('a failing commit does not take the navigation down with it', async () => {
    workspace.load(pngFile());
    spyOn(workspace, 'apply').and.throwError('cap exceeded');
    pending.registerResult('crop', png(), 'crop', 'png');

    await expectAsync(router.navigateByUrl('/a')).toBeResolved();

    expect(router.url).toBe('/a');
    // Continua pendente: falhou, então não foi entregue e não foi descartado.
    expect(pending.hasPending()).toBe(true);
  });

  it('commits once, not once per navigation', async () => {
    workspace.load(pngFile());
    pending.registerResult('crop', png(), 'crop', 'png');

    await router.navigateByUrl('/a');
    await router.navigateByUrl('/b');

    expect(workspace.history()).toEqual(['crop']);
    expect(workspace.currentFile()?.name).toBe('photo-crop.png');
  });
});
