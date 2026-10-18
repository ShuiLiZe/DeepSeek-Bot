// Mobile adaptation layer for the ds-bot surface.
//
// The bot surface was drawn for the dsh desktop/web shell: fixed-width menus,
// popovers, dialogs and a settings nav that overflow a phone viewport, inputs
// below the 16px iOS zoom threshold, and wide tables/code blocks that force
// horizontal scroll. This sheet is modeled on how dsh-mobile (saya-ch/dsh-mobile)
// adapts the DSH shell for phones, retargeted to the bot's own `bt-` classes.
//
// Everything here is ADDITIVE and scoped to narrow viewports / coarse pointers,
// so the desktop surface is byte-for-byte unchanged (>640px with a fine pointer
// matches nothing below). It mirrors the repo's own `.bt-mem` @media(max-width:640px)
// full-screen pattern, so it reads as a native extension rather than a graft.
export const MOBILE_CSS = `
/* ---- Readability & overflow (all touch widths) -------------------------- */
/* Keep focused editables above Safari's 16px zoom threshold, like dsh-mobile.
   Stock menus portal into document.body, so the floor scopes from the body. */
@media (pointer:coarse){
body :is(input,textarea,[contenteditable=true],[contenteditable=plaintext-only],[contenteditable=""]){font-size:max(16px,1em)!important}
}
/* Never let a bubble, card, table or code block force horizontal scroll. */
@media (max-width:640px){
.bt-bubble,.bt-msg,.bt-card,.bt-update-text,.bt-mem-summary{overflow-wrap:anywhere;word-break:break-word}
.bt-bubble table,.bt-msg table{display:block;max-width:100%;overflow-x:auto}
.bt-bubble pre,.bt-msg pre{max-width:100%;overflow-x:auto}
.bt-bubble img,.bt-bubble video,.bt-bubble svg,.bt-msg img,.bt-msg video,.bt-msg svg{max-width:100%;height:auto}
}

/* ---- Popovers / menus / dialogs cap to the viewport --------------------- */
/* Desktop pins these at fixed px widths; on a phone they clip off-screen.
   Cap each to the viewport with a safe-area-aware gutter; never widen desktop. */
@media (max-width:640px){
.bt-menu,.bt-account-menu,.bt-plus-menu,.bt-mem-menu,.bt-addlist,.bt-palette{max-width:calc(100vw - 24px)!important;box-sizing:border-box}
.bt-update-pop,.bt-avedit,.bt-create-card{width:auto!important;max-width:calc(100vw - 24px)!important;box-sizing:border-box}
.bt-motion-seg,.bt-account-menu{width:auto!important}
/* Full-screen sheets honour the home-indicator / notch, like dsh-mobile. */
.bt-mem{padding-bottom:env(safe-area-inset-bottom)}
.bt-mem-foot,.bt-dialog-foot{padding-bottom:max(12px,env(safe-area-inset-bottom))}
}

/* ---- Settings: stack the two-pane layout on a phone --------------------- */
/* The settings dialog is a nav rail (198px) beside a page sized from the desktop
   dialog width. On a phone: nav becomes a scrollable strip on top, the page fills
   the rest, and the close button clears the status bar. */
@media (max-width:640px){
.bt-settings-layer{inset:0!important}
.bt-settings{width:100vw!important;max-width:100vw!important;height:100%!important;border-radius:0!important;border:0!important;flex-direction:column!important;padding-top:env(safe-area-inset-top);box-sizing:border-box}
.bt-settings-nav{width:100%!important;flex:none!important;flex-direction:row!important;align-items:center;overflow-x:auto;overflow-y:hidden;border-right:0!important;border-bottom:.5px solid var(--bt-line);gap:4px;padding:8px 56px 8px 8px!important;scrollbar-width:none}
.bt-settings-nav::-webkit-scrollbar{display:none}
.bt-settings-nav>.bt-thumb{display:none!important}
.bt-settings-nav .bt-settings-item{flex:none;white-space:nowrap}
.bt-settings-nav .bt-settings-item[aria-current=page]{background:var(--bt-active)!important;color:var(--bt-ink)}
.bt-settings-main{flex:1 1 auto!important;width:100%!important;height:auto!important;min-height:0!important;padding-bottom:env(safe-area-inset-bottom);box-sizing:border-box}
.bt-settings-head{padding:12px 16px 4px!important}
.bt-settings-close{top:calc(env(safe-area-inset-top) + 8px)!important;right:8px!important;width:40px!important;height:40px!important;z-index:2}
}

/* ---- Touch targets ----------------------------------------------------- */
/* Nudge the smallest hit areas up for fingers without reflowing dense rows. */
@media (pointer:coarse){
.bt-tool{width:32px;height:32px}
.bt-seg button{height:36px}
.bt-settings-item{min-height:40px}
.bt-menu button,.bt-menu [role=menuitem]{min-height:40px}
}

/* ---- Right details panel goes full width on a phone --------------------- */
@media (max-width:640px){
.bt-panel{left:0!important;width:100vw!important;border-left:0!important;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);box-sizing:border-box}
.bt-panel-grip{display:none!important}
.bt-drawer-body{padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right))}
}

/* ---- Inside dsh-mobile: keep DS Bot layers above the mobile shell -------- */
/* dsh-mobile stacks its drawer (240), details sheet (80) and overlay host (300)
   above the page. DS Bot portals its menus and dialogs into document.body at
   40-70, so on a phone they opened underneath the drawer: visible but not
   tappable, or hidden entirely. Lift them only when the dsh-mobile shell is here. */
body:has(.dshm-shell) :is(.bt-menu,.bt-react-strip,.bt-update-pop,.bt-connect-tip){z-index:330!important}
body:has(.dshm-shell) :is(.bt-settings-layer,.bt-mem-layer,.bt-palette-layer){z-index:320!important}
body:has(.dshm-shell) .bt-panel{z-index:90!important}
body:has(.dshm-shell) .bt-toast{z-index:1000!important}
`

// Layers DS Bot draws over the page, newest last in DOM order. Each one closes on
// Escape (window keydown) in the bot's own code.
const BOT_LAYERS = [
  '.bt-menu', '.bt-react-strip', '.bt-update-pop', '.bt-us-pick', '.bt-avedit',
  '.bt-settings-layer', '.bt-mem-layer', '.bt-palette-layer', '.bt-newchat', '.bt-dialog', '.bt-create',
  '.bt-voice-stage', '.bt-panel',
].join(',')

const shown = (element) => {
  if (element.closest('[data-leaving]')) return false
  const style = getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
}

// dsh-mobile's Android Back sends a cancelable 'dsh-mobile:native-back' through
// window.dispatchEvent and closes the WebView page when nothing prevents it. Its own
// handler only knows DSH's layers: on a DS Bot dialog or menu it swallows Back and does
// nothing, which left Settings with no way out. DS Bot answers Back first for its own
// layers (Escape, the same key that closes them on desktop) and lets everything else
// through untouched. Installed once; a no-op outside dsh-mobile.
export function installMobileBack() {
  if (typeof window === 'undefined' || window.__dsBotMobileBack) return () => {}
  const original = window.dispatchEvent
  const patched = function (event) {
    if (this === window && event?.type === 'dsh-mobile:native-back' && event.cancelable && !event.defaultPrevented) {
      const open = [...document.querySelectorAll(BOT_LAYERS)].filter(shown)
      if (open.length > 0) {
        event.preventDefault()
        const target = document.activeElement && open.some(layer => layer.contains(document.activeElement)) ? document.activeElement : document.body
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
        return false
      }
    }
    return original.call(this, event)
  }
  window.dispatchEvent = patched
  window.__dsBotMobileBack = true
  return () => {
    if (window.dispatchEvent === patched) window.dispatchEvent = original
    delete window.__dsBotMobileBack
  }
}
