<template>
  <div class="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
    <div class="relative hidden overflow-hidden bg-cabana-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
      <div class="absolute inset-0 opacity-30" aria-hidden="true">
        <svg class="absolute -bottom-24 -left-24 size-[540px]" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="99" stroke="#7fd8cc" stroke-width="1" />
          <circle cx="100" cy="100" r="74" stroke="#7fd8cc" stroke-width="1" />
          <circle cx="100" cy="100" r="49" stroke="#7fd8cc" stroke-width="1" />
        </svg>
        <svg class="absolute -right-16 top-24 size-[420px]" viewBox="0 0 200 200" fill="none">
          <path d="M0 140c30-20 60-20 90 0s60 20 110 0" stroke="#f6f0e3" stroke-width="1.2" />
          <path d="M0 160c30-20 60-20 90 0s60 20 110 0" stroke="#f6f0e3" stroke-width="1.2" />
          <path d="M0 120c30-20 60-20 90 0s60 20 110 0" stroke="#f6f0e3" stroke-width="1.2" />
        </svg>
      </div>
      <div class="relative flex items-center gap-3">
        <div class="grid size-11 place-items-center rounded-2xl bg-cabana-800 ring-1 ring-white/10">
          <svg viewBox="0 0 64 64" class="size-8" aria-hidden="true">
            <path d="M14 41c9 7 27 7 36 0" stroke="#7fd8cc" stroke-width="4" stroke-linecap="round" fill="none" />
            <path d="M20 36c0-11 5-19 13-24-2 8-1 15 2 21" stroke="#f6f0e3" stroke-width="4" stroke-linecap="round" fill="none" />
            <path d="M35 32c4-9 11-13 19-13-3 7-7 11-13 13" stroke="#f6f0e3" stroke-width="4" stroke-linecap="round" fill="none" />
          </svg>
        </div>
        <div>
          <p class="text-xl font-bold tracking-tight">Cabana</p>
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-cabana-300">your personal cloud</p>
        </div>
      </div>

      <div class="relative max-w-lg">
        <p class="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
          A quiet corner of the internet,<br />right at home.
        </p>
        <p class="mt-4 text-base leading-relaxed text-cabana-100/80">
          Run self-hosted apps, keep your files close, and see what your home server is doing — all from one
          honest little dashboard.
        </p>
        <div class="mt-8 flex flex-wrap gap-2 text-xs font-medium text-cabana-200">
          <span class="rounded-full bg-white/10 px-3 py-1.5">Docker apps</span>
          <span class="rounded-full bg-white/10 px-3 py-1.5">Real host metrics</span>
          <span class="rounded-full bg-white/10 px-3 py-1.5">Your data, on your disk</span>
        </div>
      </div>

      <p class="relative text-xs leading-relaxed text-cabana-300/60">
        Independent project. App definitions come from the official CasaOS/ZimaOS app store;
        Cabana is not affiliated with CasaOS or ZimaOS.
      </p>
    </div>

    <div class="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10 lg:px-14">
      <div class="mx-auto w-full max-w-md">
        <div class="mb-8 flex items-center gap-2.5 lg:hidden">
          <div class="grid size-9 place-items-center rounded-xl bg-cabana-900">
            <svg viewBox="0 0 64 64" class="size-6" aria-hidden="true">
              <path d="M14 41c9 7 27 7 36 0" stroke="#7fd8cc" stroke-width="4" stroke-linecap="round" fill="none" />
              <path d="M20 36c0-11 5-19 13-24-2 8-1 15 2 21" stroke="#f6f0e3" stroke-width="4" stroke-linecap="round" fill="none" />
              <path d="M35 32c4-9 11-13 19-13-3 7-7 11-13 13" stroke="#f6f0e3" stroke-width="4" stroke-linecap="round" fill="none" />
            </svg>
          </div>
          <span class="font-bold">Cabana</span>
        </div>
        <slot />
      </div>
    </div>
  </div>
</template>
