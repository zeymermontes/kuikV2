Pod::Spec.new do |s|
  s.name = 'KuikPrinter'
  s.version = '0.1.0'
  s.summary = 'Raw TCP to ESC/POS receipt printers, for the Kuik Terminal app'
  s.license = 'MIT'
  s.homepage = 'https://kuik.mx'
  s.author = 'Kuik'
  s.source = { :path => '.' }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
