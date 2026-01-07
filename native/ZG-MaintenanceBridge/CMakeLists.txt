cmake_minimum_required(VERSION 3.20)
project(ZGMaintenanceBridge LANGUAGES CXX)

if(MSVC)
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

add_executable(ZG-MaintenanceBridge WIN32
  ZG-MaintenanceBridge.cpp
)

target_compile_features(ZG-MaintenanceBridge PRIVATE cxx_std_17)

target_include_directories(ZG-MaintenanceBridge PRIVATE
  ${CMAKE_SOURCE_DIR}/third_party
)

target_link_libraries(ZG-MaintenanceBridge PRIVATE winhttp version)

set_target_properties(ZG-MaintenanceBridge PROPERTIES
  OUTPUT_NAME "ZG-MaintenanceBridge"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../resources/ZG-MaintenanceBridge"
  RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_SOURCE_DIR}/../../resources/ZG-MaintenanceBridge"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_SOURCE_DIR}/../../resources/ZG-MaintenanceBridge"
)
