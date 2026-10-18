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
/* The settings dialog is a nav rail (198px) beside a page; side by side it
   leaves almost no room for content on a phone. Stack and let it fill. */
@media (max-width:640px){
.bt-settings{width:100vw!important;max-width:100vw!important;height:100%!important;border-radius:0!important;border:0!important}
.bt-settings-nav{width:100%!important;flex-direction:row!important;overflow-x:auto;border-right:0!important;border-bottom:.5px solid var(--bt-line);gap:4px;scrollbar-width:none}
.bt-settings-nav::-webkit-scrollbar{display:none}
.bt-settings-item{flex:none;white-space:nowrap}
}

/* ---- Touch targets ----------------------------------------------------- */
/* Nudge the smallest hit areas up for fingers without reflowing dense rows. */
@media (pointer:coarse){
.bt-tool{width:32px;height:32px}
.bt-seg button{height:36px}
.bt-settings-item{min-height:40px}
.bt-menu button,.bt-menu [role=menuitem]{min-height:40px}
}

/* ---- Right details drawer goes full width on a phone ------------------- */
@media (max-width:640px){
.bt-drawer-body{padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right))}
}
`
