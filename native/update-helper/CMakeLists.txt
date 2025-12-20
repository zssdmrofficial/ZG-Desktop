cmake_minimum_required(VERSION 3.20)
project(ZGUpdateHelper LANGUAGES CXX)

if(MSVC)
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

add_executable(ZG-UpdateHelper WIN32
  update_helper.cpp
)

target_compile_features(ZG-UpdateHelper PRIVATE cxx_std_17)

target_include_directories(ZG-UpdateHelper PRIVATE
  ${CMAKE_SOURCE_DIR}/third_party
)

target_link_libraries(ZG-UpdateHelper PRIVATE winhttp version)

set_target_properties(ZG-UpdateHelper PROPERTIES
  OUTPUT_NAME "ZG-UpdateHelper"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../resources/update-helper"
  RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_SOURCE_DIR}/../../resources/update-helper"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_SOURCE_DIR}/../../resources/update-helper"
)
