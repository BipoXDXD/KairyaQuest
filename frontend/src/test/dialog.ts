// O jsdom 30 não implementa `HTMLDialogElement.prototype.showModal` nem
// `close` (medido: os dois são `undefined`). Este preenchimento cobre só o
// que o `ConfirmDialog` usa: `showModal` liga `open` (e o atributo) e `close`
// o desliga e dispara `close`. Aqui o `close` é SÍNCRONO; no navegador ele vem
// numa tarefa depois (o caso do StrictMode, "close com o diálogo reaberto", é
// testado disparando o evento à mão). Não simula o topo da pilha,
// o `inert` do resto da página nem o Esc: isso é verificado no navegador real
// (projeto `ui-states` do Playwright). Só define o que estiver ausente, para
// um jsdom futuro que implemente o diálogo valer sobre este código.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) {
        return
      }
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }
}
