# Contributor License Agreement (CLA)

## Em português, e sem valor legal: por que isto existe

Nada Sai é distribuído sob a **AGPL-3.0**, e continuará sendo. Este acordo não
muda nada disso e não tira nenhum direito seu sobre o que você escrever: você
**continua dono do seu código** e pode reusá-lo onde quiser.

O que ele faz é dar ao titular do projeto uma licença **não exclusiva** para
distribuir a sua contribuição também sob outros termos — incluindo uma versão
comercial fechada, no futuro.

O motivo é mecânico, não político. Sem isto, no instante em que um PR de outra
pessoa é aceito, ela passa a ser cotitular daquele trecho, e qualquer decisão
futura sobre licenciamento passa a exigir a autorização de **todos** os que já
contribuíram — inclusive de quem sumiu. Na prática isso congela o projeto na
licença atual para sempre, ou obriga a reescrever o trecho de quem não puder ser
localizado. Projetos que fazem licenciamento duplo (Qt, MongoDB, Grafana, Sentry)
pedem exatamente isto, e pela mesma razão.

**O texto em inglês abaixo é o que vale.** Esta seção é só explicação.

---

## Agreement

This is the governing version of this document.

By submitting a Contribution to this project, You accept and agree to the
following terms for Your present and future Contributions. Except for the
licenses granted herein, You reserve all right, title, and interest in and to
Your Contributions.

**1. Definitions.**
"You" means the copyright owner, or the legal entity authorized by the copyright
owner, entering into this Agreement. "Project Owner" means Luckas Ferreira, the
copyright holder of Nada Sai. "Contribution" means any original work of
authorship, including any modification of or addition to an existing work, that
is intentionally submitted by You to the Project Owner for inclusion in the
project, in any form and through any medium, including but not limited to pull
requests, patches, and issue attachments.

**2. Grant of Copyright License.**
You hereby grant to the Project Owner a perpetual, worldwide, non-exclusive,
no-charge, royalty-free, irrevocable copyright license to reproduce, prepare
derivative works of, publicly display, publicly perform, sublicense, and
distribute Your Contributions and such derivative works, **under any license
terms, including copyleft, permissive, proprietary and commercial license
terms**, and to relicense the project as a whole accordingly.

This grant is non-exclusive. You retain the right to use, license, and
distribute Your Contribution however You wish, including under any other terms.

**3. Grant of Patent License.**
You hereby grant to the Project Owner and to recipients of software distributed
by the Project Owner a perpetual, worldwide, non-exclusive, no-charge,
royalty-free, irrevocable (except as stated in this section) patent license to
make, have made, use, offer to sell, sell, import, and otherwise transfer Your
Contribution, where such license applies only to those patent claims licensable
by You that are necessarily infringed by Your Contribution alone or by
combination of Your Contribution with the project to which it was submitted. If
any entity institutes patent litigation against You or any other entity alleging
that Your Contribution, or the project to which it was submitted, constitutes
direct or contributory patent infringement, then any patent licenses granted to
that entity under this Agreement for that Contribution shall terminate as of the
date such litigation is filed.

**4. Representations.**
You represent that:

  a. You are legally entitled to grant the above licenses, and each Contribution
     is Your original creation.

  b. If Your employer has rights to intellectual property that You create, You
     represent that You have received permission to make the Contribution on
     behalf of that employer, or that Your employer has waived such rights.

  c. Your Contribution does not knowingly include third-party code, assets or
     models that You are not entitled to submit under these terms. If Your
     Contribution includes any work that is not Your original creation, You will
     identify it, together with its source, license and any restrictions, in the
     pull request description.

**5. No Warranty.**
Unless required by applicable law or agreed to in writing, You provide Your
Contributions on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
either express or implied, including, without limitation, any warranties or
conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
PARTICULAR PURPOSE.

**6. No Obligation.**
The Project Owner is under no obligation to accept, merge, or use any
Contribution.

**7. Governing Law.**
This Agreement is governed by the laws of the Federative Republic of Brazil,
without regard to its conflict of law provisions.

---

## How to sign

When you open your first pull request, a bot will comment asking you to sign.
Post a **new comment** on that pull request containing exactly this sentence,
and nothing else:

```
I have read the CLA Document and I hereby sign the CLA
```

The wording is matched literally by `.github/workflows/cla.yml`. Do not
reword it, do not translate it, and do not add a trailing period — a sentence
that does not match is not recorded, and the check stays red.

Your signature is stored in `.github/cla-signatures.json` in this repository,
together with your GitHub username and the date. It is recorded once and covers
that Contribution and every later one you submit, so you are only asked on your
first pull request.
